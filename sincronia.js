/* Il collegamento fra questa cassa e il server.

   Tre mestieri, e nessun altro:
     1. dare a questo dispositivo un codice suo, che non cambia mai;
     2. chiedere al server chi siamo - cioe' se possiamo modificare o solo guardare;
     3. portare avanti e indietro le giornate e il listino.

   Quello che NON fa, ed e' la regola che tiene in piedi l'intervallo di dieci
   minuti: non blocca mai una vendita. Se il server non c'e', non risponde o e'
   lento, la cassa lavora lo stesso e i conti restano qui ad aspettare. La rete e'
   un di piu' che arriva dopo, mai una condizione per battere cassa.

   L'altra regola: il ruolo non si tiene da parte. Al primo avvio siamo sempre
   'cassa', e si diventa 'sviluppatore' solo se il server lo dice adesso. Cosi'
   nessuno puo' fingersi autorizzato staccando il wifi.  */

'use strict';

/* ----------------------------------------------------------------------------
   L'INDIRIZZO DEL SERVER - e' l'unica riga da riempire a mano.

   Si prende dal pannello di Cloudflare dopo aver creato il Worker 'cassa-bar', e
   ha questa forma:  https://cassa-bar.qualcosa.workers.dev
   Niente barra finale.

   Finche' resta vuota l'app funziona esattamente come prima: tutto su questo
   dispositivo, niente sincronizzazione, e le schermate lo dicono chiaramente.
   ---------------------------------------------------------------------------- */
var INDIRIZZO = 'https://cassa-bar.barscolastico.workers.dev';

var CHIAVE_DISPOSITIVO = 'cassa-bar-scolastico.dispositivo';
var CHIAVE_COPIA = 'cassa-bar-scolastico.nuvola';

// Ogni quanto si richiede al server come stanno le cose, mentre l'app e' in primo
// piano. Venticinque secondi: un prezzo cambiato si vede quasi subito, e restiamo
// lontanissimi da qualunque limite di Cloudflare.
var ATTESA_NORMALE = 25000;
var ATTESA_DOPO_ERRORE = 60000;
var ATTESA_MASSIMA = 180000;

// Una richiesta che non torna entro otto secondi si considera persa: meglio
// riprovare fra poco che restare appesi.
var TEMPO_MASSIMO = 8000;

// --------------------------------------------------------------- il dispositivo

/* Sedici byte casuali, scritti in esadecimale. Non e' un nome: e' un codice che
   non dice niente di chi lo usa, e serve solo al server per riconoscere che le
   richieste arrivano sempre dallo stesso posto. */
function generaCodice() {
  var byte = new Uint8Array(16);
  window.crypto.getRandomValues(byte);
  return Array.prototype.map.call(byte, function (b) {
    return b.toString(16).padStart(2, '0');
  }).join('');
}

function codiceDispositivo() {
  var salvato = null;
  try { salvato = window.localStorage.getItem(CHIAVE_DISPOSITIVO); } catch (e) { salvato = null; }

  if (salvato && /^[0-9a-f]{32}$/.test(salvato)) { return salvato; }

  var nuovo = generaCodice();
  try { window.localStorage.setItem(CHIAVE_DISPOSITIVO, nuovo); } catch (e) { /* niente da fare */ }
  return nuovo;
}

// --------------------------------------------------------------- lo stato qui

var dispositivo = codiceDispositivo();

/* Il ruolo parte sempre dal basso e non si salva mai su questo dispositivo:
   e' una risposta del server, valida finche' il server risponde. */
var ruolo = 'cassa';
var collegato = false;
var ultimo_errore = '';

var copia = { prodotti: null, giornate: [], quando: '' };

var attesa = ATTESA_NORMALE;
var orologio = null;
var da_fare = [];          // chi vuole essere avvisato quando arrivano notizie
var finestra = { dal: '0000-01-01', al: '9999-12-31' };

function leggiCopia() {
  var grezzo = null;
  try { grezzo = window.localStorage.getItem(CHIAVE_COPIA); } catch (e) { return; }
  if (!grezzo) { return; }

  try {
    var letto = JSON.parse(grezzo);
    if (letto && typeof letto === 'object') {
      copia.prodotti = (letto.prodotti && Array.isArray(letto.prodotti.elenco)) ? letto.prodotti : null;
      copia.giornate = Array.isArray(letto.giornate) ? letto.giornate : [];
      copia.quando = typeof letto.quando === 'string' ? letto.quando : '';
    }
  } catch (e) { /* una copia rovinata si butta e si riparte dal server */ }
}

function scriviCopia() {
  try { window.localStorage.setItem(CHIAVE_COPIA, JSON.stringify(copia)); } catch (e) { /* niente da fare */ }
}

function avvisa() {
  da_fare.forEach(function (f) {
    try { f(); } catch (e) { /* un ascoltatore rotto non deve fermare gli altri */ }
  });
}

// --------------------------------------------------------------- parlare

/* Sempre POST, mai GET. Non e' un capriccio: la cassaforte offline dell'app mette
   da parte le letture, e una risposta del server messa in cassaforte vorrebbe dire
   vedere per giorni un listino vecchio senza capire perche'.

   Quando va male, questa funzione rifiuta la promessa - e chi la riceve deve poter
   capire QUALE dei due guai e' capitato, perche' la cura e' opposta:

     - non e' arrivata nessuna risposta: rete staccata, wifi della scuola giu',
       otto secondi scaduti. Si riprova, e prima o poi passa;
     - una risposta e' arrivata ed e' un no motivato. Riprovare la stessa cosa non
       la fa diventare buona: una data del 1970 sara' sbagliata anche domani.

   Fino al 17 settembre 2026 i due casi arrivavano identici - un Error e basta - e
   la cassa non poteva distinguerli: § La coda degli invii in cassa.md. Adesso
   l'errore che nasce da una RISPOSTA se lo porta scritto addosso, insieme al codice
   che il server ha usato. Chi non guarda quei due campi si comporta come prima. */
function chiedi(azione, dati) {
  if (!INDIRIZZO) {
    return Promise.reject(new Error('indirizzo del server non configurato'));
  }

  var corpo = { azione: azione, dispositivo: dispositivo };
  Object.keys(dati || {}).forEach(function (k) { corpo[k] = dati[k]; });

  var taglia = null;
  var ferma = null;
  if (typeof AbortController === 'function') {
    ferma = new AbortController();
    taglia = window.setTimeout(function () { ferma.abort(); }, TEMPO_MASSIMO);
  }

  /* Lo stato va preso al volo qui sotto, dove la risposta c'e' ancora: nel passo
     dopo si ha in mano solo quello che c'era scritto dentro. */
  var stato_http = 0;

  return fetch(INDIRIZZO, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(corpo),
    signal: ferma ? ferma.signal : undefined,
    cache: 'no-store'
  }).then(function (risposta) {
    stato_http = risposta.status;
    return risposta.json().catch(function () { return { ok: false, errore: 'risposta illeggibile' }; });
  }).then(function (esito) {
    if (!esito || esito.ok !== true) {
      var guasto = new Error((esito && esito.errore) ? esito.errore : 'il server ha detto di no');
      guasto.rispostaDelServer = true;
      guasto.stato = stato_http;
      throw guasto;
    }
    return esito;
  }).finally(function () {
    if (taglia !== null) { window.clearTimeout(taglia); }
  });
}

// --------------------------------------------------------------- le notizie

/* Una richiesta sola per sapere tutto: chi siamo, il listino, e le giornate
   dell'anno scolastico che si sta guardando. */
function aggiorna() {
  return chiedi('stato', { dal: finestra.dal, al: finestra.al }).then(function (esito) {
    ruolo = esito.ruolo === 'sviluppatore' ? 'sviluppatore' : 'cassa';
    copia.prodotti = esito.prodotti || null;
    copia.giornate = Array.isArray(esito.giornate) ? esito.giornate : [];
    copia.quando = new Date().toISOString();
    scriviCopia();

    collegato = true;
    ultimo_errore = '';
    attesa = ATTESA_NORMALE;
    return esito;
  }).catch(function (e) {
    /* Persa la linea si torna semplicemente a guardare: il ruolo scende a 'cassa',
       e la copia locale resta quella dell'ultima volta che ci siamo parlati. */
    ruolo = 'cassa';
    collegato = false;
    ultimo_errore = e.message || 'non raggiungibile';
    attesa = Math.min(Math.max(attesa, ATTESA_DOPO_ERRORE) * 2, ATTESA_MASSIMA);
    throw e;
  });
}

function giroCompleto() {
  if (!INDIRIZZO) { return Promise.resolve(); }
  return aggiorna().then(avvisa, function () { avvisa(); });
}

function riprogramma() {
  if (orologio !== null) { window.clearTimeout(orologio); }
  if (!INDIRIZZO) { return; }

  orologio = window.setTimeout(function () {
    orologio = null;
    if (document.visibilityState === 'visible') {
      giroCompleto().then(riprogramma, riprogramma);
    } else {
      // A schermo spento non si consuma rete: si riprende al rientro.
      riprogramma();
    }
  }, attesa);
}

// --------------------------------------------------------------- fuori

window.Sincronia = {

  dispositivo: function () { return dispositivo; },
  ruolo: function () { return ruolo; },

  /* L'unica domanda che il resto dell'app deve farsi prima di mostrare un pulsante
     che modifica qualcosa.

     Senza indirizzo del server la risposta e' si', e non e' una scappatoia: se non
     c'e' un server non c'e' niente di condiviso da proteggere, e l'app e' quella di
     prima, un dispositivo solo che tiene i conti suoi. Vietare le modifiche li'
     vorrebbe dire non poter nemmeno scrivere i prezzi il giorno che si comincia.

     Appena l'indirizzo c'e', decide il server: irraggiungibile vuol dire ruolo
     'cassa', cioe' guardare e basta. Staccare il wifi non promuove nessuno. */
  puoModificare: function () {
    return INDIRIZZO === '' || ruolo === 'sviluppatore';
  },

  collegato: function () { return collegato; },
  configurato: function () { return INDIRIZZO !== ''; },
  errore: function () { return ultimo_errore; },
  quando: function () { return copia.quando; },

  prodotti: function () { return copia.prodotti; },
  giornate: function () { return copia.giornate.slice(); },

  /* L'anno scolastico che l'app sta guardando. Chiedere solo quello tiene la
     risposta piccola anche fra cinque anni di giornate. */
  guarda: function (dal, al) {
    finestra.dal = dal;
    finestra.al = al;
  },

  aggiorna: function () { return aggiorna(); },

  /* I conti di questo dispositivo per un giorno: si manda il TOTALE, mai quanto e'
     cambiato. Se la rete cade a meta' e si riprova, il secondo invio riscrive lo
     stesso numero invece di sommarlo un'altra volta. */
  mandaGiornata: function (g) {
    return chiedi('giornata', {
      data: g.data,
      vendite: g.vendite,
      incasso: g.incasso,
      /* Le due parti dell'incasso che nella scatola non sono entrate: il buono che
         nessuno ha pagato, e la merce andata via a credito. Un server vecchio le
         ignora e le mette a zero - e' il motivo per cui il server si aggiorna
         PRIMA dell'app, non dopo. */
      buoni: g.buoni || 0,
      crediti: g.crediti || 0,
      voci: g.voci,
      automatica: !!g.automatica
    });
  },

  mandaProdotti: function (elenco) {
    return chiedi('prodotti', { elenco: elenco });
  },

  // Non cancella: il server ci mette un segno sopra e la giornata esce dai conti.
  annulla: function (data) {
    return chiedi('annulla', { data: data });
  },

  quandoCambia: function (f) { da_fare.push(f); },

  avvia: function () {
    leggiCopia();
    if (!INDIRIZZO) { return Promise.resolve(); }

    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState !== 'visible') { return; }
      // Al rientro si riparte subito, senza aspettare il giro normale.
      attesa = ATTESA_NORMALE;
      giroCompleto().then(riprogramma, riprogramma);
    });

    window.addEventListener('online', function () {
      attesa = ATTESA_NORMALE;
      giroCompleto().then(riprogramma, riprogramma);
    });

    return giroCompleto().then(riprogramma, riprogramma);
  }
};
