/* Cassa del bar scolastico — tutta la logica.

   Regola numero uno: i soldi si contano in CENTESIMI INTERI, mai con la virgola.
   In JavaScript 0.1 + 0.2 non fa 0.3, e un resto sbagliato di un centesimo al banco
   e' un litigio. Si divide per 100 solo nell'ultimo istante, per scriverlo a schermo.  */

'use strict';

// --------------------------------------------------------------- memoria

var CHIAVE = 'cassa-bar-scolastico.v1';

/* L'IMPRONTA della password, non la password. Serve a non lasciarla scritta in
   chiaro in un file che chiunque puo' aprire dal sito.

   Da sapere, perche' non si scopra dopo: e' un lucchetto contro gli ERRORI e contro
   i curiosi, non contro chi sa usare gli strumenti per sviluppatori del browser.
   Deve stare qui perche' l'app deve aprirsi anche senza rete. I permessi veri -
   cambiare i prezzi, togliere una giornata - non passano da qui: li decide il
   server, che sui permessi non si fida mai di quello che dice l'app.

   Per cambiarla si rifa' l'impronta e si sostituisce questa riga:
     python -c "import hashlib; print(hashlib.sha256('nuova'.encode()).hexdigest())"  */
var IMPRONTA_PASSWORD = '2a8981c01f050ea08357ca1a233c67f2364839bd3a45ed1afe713f64f4241d15';

/* I tagli che il cliente puo' allungare. In centesimi, dai dieci centesimi ai
   cinquanta euro. Sono nove: insieme a «Conta giusti», che ne occupa tre, riempiono
   esatte tre righe da quattro. Cambiarne il numero vuol dire rifare quel conto
   in stile.css, altrimenti resta un buco in fondo alla griglia. */
var TAGLI = [10, 20, 50, 100, 200, 500, 1000, 2000, 5000];

// Cosa c'e' al primo avvio. Sono valori d'esempio: si cambiano dalla schermata Prodotti.
var PRODOTTI_ESEMPIO = [
  { nome: 'Pizzetta', prezzo: 100 },
  { nome: 'Focaccia', prezzo: 150 },
  { nome: 'Acqua', prezzo: 50 },
  { nome: 'Bibita', prezzo: 100 },
  { nome: 'Succo', prezzo: 100 },
  { nome: 'Crackers', prezzo: 50 }
];

var stato = null;

function oggi() {
  var d = new Date();
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
}

function nuovoId() {
  return 'p' + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
}

function giornataVuota() {
  return { data: oggi(), vendite: 0, incasso: 0, voci: {} };
}

function statoIniziale() {
  return {
    prodotti: PRODOTTI_ESEMPIO.map(function (p) {
      return { id: nuovoId(), nome: p.nome, prezzo: p.prezzo };
    }),
    vendita: { righe: [], contanti: 0 },
    giornata: giornataVuota(),

    /* Le giornate chiuse DA QUESTO DISPOSITIVO, dalla piu' vecchia alla piu'
       recente. Non e' piu' «lo storico»: lo storico completo sta sul server e
       comprende anche gli altri dispositivi. Qui restano solo i conti miei, che
       sono quelli che devo mandare, e ognuno sa se e' gia' partito. */
    mio: []
  };
}

var GIORNI_SETTIMANA = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì',
                        'venerdì', 'sabato'];
var MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio',
            'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];

/* Nell'elenco l'anno si omette: sta gia' nel titolo della schermata, e dentro un anno
   scolastico un «15 settembre» ce n'e' uno solo. Nel file da salvare invece ci va. */
function dataLunga(iso, con_anno) {
  var p = iso.split('-');
  var d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
  return GIORNI_SETTIMANA[d.getDay()] + ' ' + Number(p[2]) + ' ' + MESI[Number(p[1]) - 1] +
         (con_anno ? ' ' + p[0] : '');
}

/* L'anno scolastico non e' quello del calendario: comincia a settembre. Un giorno di
   gennaio appartiene all'anno cominciato l'autunno prima. */
function annoScolastico(iso) {
  var a = Number(iso.slice(0, 4));
  var m = Number(iso.slice(5, 7));
  return m >= 9 ? a + '/' + (a + 1) : (a - 1) + '/' + a;
}

function pezziDelGiorno(g) {
  return Object.keys(g.voci).reduce(function (n, k) { return n + g.voci[k].qta; }, 0);
}

/* Rileggere quello che c'e' salvato senza fidarsene: il salvataggio puo' essere
   vuoto (primo avvio, cronologia pulita), di una versione vecchia, o rovinato a meta'.
   In tutti questi casi si riparte dagli esempi invece di mostrare una schermata rotta. */
function carica() {
  var grezzo = null;
  try { grezzo = window.localStorage.getItem(CHIAVE); } catch (e) { grezzo = null; }
  if (!grezzo) { return statoIniziale(); }

  var letto;
  try { letto = JSON.parse(grezzo); } catch (e) { return statoIniziale(); }
  if (!letto || typeof letto !== 'object') { return statoIniziale(); }

  var s = statoIniziale();

  if (Array.isArray(letto.prodotti)) {
    var buoni = letto.prodotti.filter(function (p) {
      return p && typeof p.nome === 'string' && Number.isFinite(p.prezzo) && p.prezzo > 0;
    }).map(function (p) {
      return { id: p.id || nuovoId(), nome: p.nome, prezzo: Math.round(p.prezzo) };
    });
    // Un catalogo svuotato apposta e' una scelta legittima: si rispetta.
    if (letto.prodotti.length === 0 || buoni.length > 0) { s.prodotti = buoni; }
  }

  if (letto.vendita && Array.isArray(letto.vendita.righe)) {
    s.vendita.righe = letto.vendita.righe.filter(function (r) {
      return r && r.id && Number.isFinite(r.qta) && r.qta > 0;
    }).map(function (r) { return { id: r.id, qta: Math.round(r.qta) }; });
    s.vendita.contanti = Number.isFinite(letto.vendita.contanti) && letto.vendita.contanti > 0
      ? Math.round(letto.vendita.contanti) : 0;
  }

  if (letto.giornata && typeof letto.giornata.data === 'string') {
    s.giornata = {
      data: letto.giornata.data,
      vendite: Number.isFinite(letto.giornata.vendite) ? letto.giornata.vendite : 0,
      incasso: Number.isFinite(letto.giornata.incasso) ? letto.giornata.incasso : 0,
      voci: (letto.giornata.voci && typeof letto.giornata.voci === 'object') ? letto.giornata.voci : {}
    };
  }

  /* Le giornate di questo dispositivo. 'storico' e' il nome vecchio, di quando i
     conti stavano solo qui: se lo si trova si prende lo stesso, segnando tutto come
     ancora da mandare, cosi' quello che c'era prima del server non si perde. */
  var mie = Array.isArray(letto.mio) ? letto.mio
          : (Array.isArray(letto.storico) ? letto.storico : null);

  if (mie) {
    s.mio = mie.filter(function (g) {
      return g && typeof g.data === 'string' && Number.isFinite(g.incasso);
    }).map(function (g) {
      return {
        data: g.data,
        vendite: Number.isFinite(g.vendite) ? g.vendite : 0,
        incasso: g.incasso,
        voci: (g.voci && typeof g.voci === 'object') ? g.voci : {},
        automatica: !!g.automatica,
        inviata: g.inviata === true
      };
    });
  }

  /* Formato vecchio: la giornata non chiusa stava da sola in 'precedente' e si perdeva
     al giorno dopo. Adesso c'e' lo storico, quindi la si recupera li' dentro. */
  if (letto.precedente && typeof letto.precedente === 'object' &&
      typeof letto.precedente.data === 'string' && letto.precedente.incasso > 0) {
    var gia = s.mio.some(function (g) { return g.data === letto.precedente.data; });
    if (!gia) {
      s.mio.push({
        data: letto.precedente.data,
        vendite: Number.isFinite(letto.precedente.vendite) ? letto.precedente.vendite : 0,
        incasso: letto.precedente.incasso,
        voci: {},
        automatica: true,
        inviata: false
      });
    }
  }

  s.mio.sort(function (a, b) { return a.data < b.data ? -1 : (a.data > b.data ? 1 : 0); });

  return s;
}

function salva() {
  try { window.localStorage.setItem(CHIAVE, JSON.stringify(stato)); } catch (e) { /* niente da fare */ }
}

/* Somma le voci di una giornata dentro un'altra: per ogni prodotto, i pezzi e
   l'incasso. Serve ad archiviare, e serve a mettere insieme quello che hanno fatto
   dispositivi diversi nello stesso giorno. */
function sommaVoci(dentro, da) {
  Object.keys(da || {}).forEach(function (k) {
    var v = da[k];
    var d = dentro[k] || { nome: v.nome, qta: 0, somma: 0 };
    d.nome = v.nome;
    d.qta += v.qta;
    d.somma += v.somma;
    dentro[k] = d;
  });
}

/* Mette una giornata fra quelle chiuse da questo dispositivo. Se quel giorno c'e'
   gia' (cassa chiusa due volte nello stesso giorno) i conti si sommano invece di
   creare un doppione.

   In tutti e due i casi la riga torna «da mandare»: al server si spedisce sempre
   il TOTALE del giorno, mai quanto e' cambiato, e quindi il totale nuovo deve
   ripartire anche se il vecchio era gia' arrivato. */
function archivia(giornata, automatica) {
  if (!giornata || (giornata.vendite === 0 && giornata.incasso === 0)) { return; }

  var esistente = null;
  stato.mio.forEach(function (g) { if (g.data === giornata.data) { esistente = g; } });

  if (esistente) {
    esistente.vendite += giornata.vendite;
    esistente.incasso += giornata.incasso;
    sommaVoci(esistente.voci, giornata.voci);
    if (!automatica) { esistente.automatica = false; }
    esistente.inviata = false;
    return;
  }

  stato.mio.push({
    data: giornata.data,
    vendite: giornata.vendite,
    incasso: giornata.incasso,
    voci: giornata.voci,
    automatica: !!automatica,
    inviata: false
  });
  stato.mio.sort(function (a, b) { return a.data < b.data ? -1 : (a.data > b.data ? 1 : 0); });
}

/* Se l'app si riapre in un giorno diverso, i totali di ieri non devono sommarsi a quelli
   di oggi. Non si buttano: finiscono nello storico segnati come «non chiusa a mano»,
   cosi' un incasso dimenticato resta comunque contato nell'anno. */
function allineaGiornata() {
  if (stato.giornata.data === oggi()) { return; }
  archivia(stato.giornata, true);
  stato.giornata = giornataVuota();
  salva();
  spingiCoda();          // una giornata dimenticata parte lo stesso, appena si puo'
}

// --------------------------------------------------------------- l'anno in corso

/* Da «2026/2027» al primo e all'ultimo giorno buoni. L'anno scolastico comincia il
   primo settembre e finisce il trentuno agosto dopo.

   Serve da quando non c'e' piu' il pulsante che azzera tutto: senza un limite, a
   settembre 2027 lo Storico sommerebbe due anni insieme e nessuno se ne
   accorgerebbe. Gli anni vecchi non spariscono, restano sul server. */
function estremiAnno(anno) {
  var a = Number(String(anno).slice(0, 4));
  return { dal: a + '-09-01', al: (a + 1) + '-08-31' };
}

function annoCorrente() { return annoScolastico(oggi()); }

// --------------------------------------------------------------- le giornate di tutti

/* Lo Storico come si vede: le giornate del server, cioe' di tutti i dispositivi,
   piu' le mie. Le mie vincono sulla copia che ne ha il server, perche' potrebbero
   essere cambiate da poco e non essere ancora partite.

   Il risultato e' una riga per giorno, coi conti del bar sommati. Chi ha battuto
   cosa resta scritto sul server: qui serve sapere quanto ha fatto la scuola. */
function giornateUnite(dal, al) {
  var per_data = {};
  var mio_codice = window.Sincronia.dispositivo();

  var mie_date = {};
  stato.mio.forEach(function (g) { mie_date[g.data] = true; });

  function aggiungi(g, non_inviata) {
    if (dal && g.data < dal) { return; }
    if (al && g.data > al) { return; }

    var d = per_data[g.data];
    if (!d) {
      d = per_data[g.data] = {
        data: g.data, vendite: 0, incasso: 0, voci: {},
        automatica: false, da_inviare: false
      };
    }
    d.vendite += g.vendite;
    d.incasso += g.incasso;
    d.automatica = d.automatica || !!g.automatica;
    d.da_inviare = d.da_inviare || !!non_inviata;
    sommaVoci(d.voci, g.voci);
  }

  window.Sincronia.giornate().forEach(function (g) {
    // La mia riga la prendo da qui sotto, che e' piu' fresca. Ma solo se ce l'ho
    // davvero: se la memoria di questo browser e' stata svuotata, quella del
    // server e' l'unica rimasta e non va buttata via.
    if (g.dispositivo === mio_codice && mie_date[g.data]) { return; }
    aggiungi(g, false);
  });

  stato.mio.forEach(function (g) { aggiungi(g, !g.inviata); });

  return Object.keys(per_data).sort().map(function (k) { return per_data[k]; });
}

function giornateDellAnno() {
  var e = estremiAnno(annoCorrente());
  return giornateUnite(e.dal, e.al);
}

// Le righe che gli ALTRI dispositivi hanno mandato per un certo giorno.
function giornateAltrui(data) {
  var mio_codice = window.Sincronia.dispositivo();
  return window.Sincronia.giornate().filter(function (g) {
    return g.data === data && g.dispositivo !== mio_codice;
  });
}

// --------------------------------------------------------------- la coda d'invio

var invio_in_corso = false;
var coda_da_rifare = false;

/* Le giornate mie che non sono ancora arrivate al server. Si riprova a ogni giro di
   controllo e a ogni rientro nell'app: chiudere la cassa senza rete non deve far
   perdere niente, e infatti non lo fa - i conti restano qui e partono da soli.

   Se qualcuno chiede di spingere mentre un tentativo e' ancora per aria - succede
   quando la rete torna proprio mentre quello di prima sta scadendo - la richiesta
   non si butta via: si rifa' appena l'altro ha finito. Una giornata che aspetta e'
   l'unica cosa qui dentro che non deve restare indietro. */
function spingiCoda() {
  if (!window.Sincronia.configurato()) { return Promise.resolve(); }
  if (invio_in_corso) { coda_da_rifare = true; return Promise.resolve(); }

  var rimaste = stato.mio.filter(function (g) { return !g.inviata; });
  if (rimaste.length === 0) { return Promise.resolve(); }

  invio_in_corso = true;

  return rimaste.reduce(function (catena, g) {
    return catena.then(function () {
      return window.Sincronia.mandaGiornata(g).then(function () {
        g.inviata = true;
        salva();
      });
    });
  }, Promise.resolve()).catch(function () {
    // Linea persa a meta': quelle che restano riprovano al giro dopo.
  }).then(function () {
    invio_in_corso = false;
    if (!coda_da_rifare) { return; }
    coda_da_rifare = false;
    return spingiCoda();
  });
}

/* Il listino del server vince su quello locale: e' uno solo per tutti, e chi non ha
   il permesso non ha modo di cambiarlo. Non si tocca mentre una riga e' aperta in
   modifica, altrimenti sparirebbe da sotto le dita di chi sta scrivendo. */
function adottaProdotti() {
  var dal_server = window.Sincronia.prodotti();
  if (!dal_server || !Array.isArray(dal_server.elenco)) { return false; }
  if (document.querySelector('#elenco-prodotti li.in-modifica')) { return false; }

  var nuovo = dal_server.elenco.map(function (p) {
    return { id: p.id, nome: p.nome, prezzo: p.prezzo };
  });
  if (JSON.stringify(nuovo) === JSON.stringify(stato.prodotti)) { return false; }

  stato.prodotti = nuovo;
  // Le righe della vendita aperta che puntano a un prodotto sparito si tolgono.
  stato.vendita.righe = stato.vendita.righe.filter(function (r) { return prodottoCon(r.id) !== null; });
  salva();
  return true;
}

function copiaProdotti() {
  return stato.prodotti.map(function (p) {
    return { id: p.id, nome: p.nome, prezzo: p.prezzo };
  });
}

/* Il listino non e' roba di questo dispositivo: e' di tutti. Quindi non basta
   salvarlo qui, va mandato al server - ed e' il server a decidere se questo
   dispositivo puo' farlo.

   Se dice di no, o se la linea cade, si rimette esattamente quello che c'era prima.
   Meglio nessuna modifica che due dispositivi con due listini diversi, perche' due
   listini diversi vogliono dire due prezzi diversi allo stesso banco. */
function salvaProdotti(prima) {
  salva();
  disegnaProdotti();

  if (!window.Sincronia.configurato()) { return; }

  window.Sincronia.mandaProdotti(stato.prodotti).then(function () {
    return window.Sincronia.aggiorna();
  }).then(function () {
    adottaProdotti();
    disegnaProdotti();
  }, function (e) {
    stato.prodotti = prima;
    stato.vendita.righe = stato.vendita.righe.filter(function (r) { return prodottoCon(r.id) !== null; });
    salva();
    disegnaProdotti();
    window.alert('Il listino non è stato cambiato: ' + (e.message || 'il server non risponde.'));
  });
}

/* Una riga sola, tenue, che dice come sta il collegamento. Non deve gridare, ma non
   deve nemmeno mancare: senza, non si saprebbe mai se i conti sono arrivati. */
function descriviRete(nodo) {
  if (!nodo) { return; }
  nodo.className = 'stato-rete';

  if (!window.Sincronia.configurato()) {
    nodo.textContent = 'Server non impostato: i conti restano su questo dispositivo, ' +
      'non si vedono altrove, e da qui si può cambiare tutto. È l’app di prima. ' +
      'Per collegare i dispositivi si scrive l’indirizzo del server in sincronia.js.';
    return;
  }

  var in_coda = stato.mio.filter(function (g) { return !g.inviata; }).length;

  if (!window.Sincronia.collegato()) {
    nodo.classList.add('attenzione');
    nodo.textContent = 'Senza collegamento: qui vedi solo questo dispositivo. ' +
      (in_coda > 0
        ? (in_coda === 1
          ? 'Una giornata è al sicuro qui e partirà da sola appena torna la rete.'
          : in_coda + ' giornate sono al sicuro qui e partiranno da sole appena torna la rete.')
        : 'I conti sono al sicuro qui.');
    return;
  }

  if (in_coda > 0) {
    nodo.classList.add('attenzione');
    nodo.textContent = 'Sto mandando ' + in_coda +
      (in_coda === 1 ? ' giornata' : ' giornate') + ' al server.';
    return;
  }

  var q = window.Sincronia.quando();
  var ora = q ? new Date(q) : null;
  nodo.textContent = 'Collegato' +
    (ora ? ', ultimo controllo alle ' + String(ora.getHours()).padStart(2, '0') + ':' +
           String(ora.getMinutes()).padStart(2, '0') : '') +
    '. Questo dispositivo può ' +
    (window.Sincronia.puoModificare() ? 'modificare Storico e Prodotti.' : 'solo guardare Storico e Prodotti.');
}

// --------------------------------------------------------------- il lucchetto

function impronta(testo) {
  var byte = new TextEncoder().encode(testo);
  return window.crypto.subtle.digest('SHA-256', byte).then(function (somma) {
    return Array.prototype.map.call(new Uint8Array(somma), function (b) {
      return b.toString(16).padStart(2, '0');
    }).join('');
  });
}

var tentativi_sbagliati = 0;
var dopo_il_lucchetto = null;

/* Chiede la password e va avanti solo se e' giusta. Serve due volte: per entrare
   nell'app e per chiudere la cassa. E' una schermata dentro la pagina e non una
   finestra del sistema, perche' dentro un'app installata su telefono quelle a volte
   non compaiono affatto - e una cassa che non si chiude e' un guaio. */
/* Coprire lo schermo non basta: col tasto Tab si arriverebbe lo stesso ai pulsanti
   che stanno sotto, e il lucchetto sarebbe aggirabile senza sapere niente. 'inert'
   spegne davvero quello che c'e' dietro - clic, tastiera e lettori di schermo. */
function sfondoInerte(si) {
  ['header', 'main'].forEach(function (sel) {
    var n = document.querySelector(sel);
    if (!n) { return; }
    if (si) { n.setAttribute('inert', ''); } else { n.removeAttribute('inert'); }
  });
}

function chiediPassword(opzioni, poi) {
  sfondoInerte(true);
  $('#lucchetto-titolo').textContent = opzioni.titolo;
  $('#lucchetto-invito').textContent = opzioni.invito;
  $('#lucchetto-ok').textContent = opzioni.pulsante;
  $('#lucchetto-lascia').hidden = !opzioni.annullabile;

  var campo = $('#lucchetto-campo');
  campo.value = '';
  $('#lucchetto-errore').hidden = true;
  $('#lucchetto').hidden = false;

  dopo_il_lucchetto = poi;
  window.setTimeout(function () { campo.focus(); }, 60);
}

function chiudiLucchetto() {
  $('#lucchetto').hidden = true;
  $('#lucchetto-campo').value = '';
  dopo_il_lucchetto = null;
  sfondoInerte(false);
}

/* Dopo qualche tentativo sbagliato si aspetta. Non ferma nessuno per sempre: toglie
   la voglia di provarle tutte una dopo l'altra. */
function fermaPer(secondi) {
  var ok = $('#lucchetto-ok');
  var errore = $('#lucchetto-errore');
  ok.disabled = true;

  var restano = secondi;
  var tic = window.setInterval(function () {
    restano -= 1;
    if (restano > 0) {
      mostraErrore(errore, 'Troppi tentativi. Riprova fra ' + restano + ' second' +
                   (restano === 1 ? 'o' : 'i') + '.');
      return;
    }
    window.clearInterval(tic);
    ok.disabled = false;
    mostraErrore(errore, 'Riprova.');
  }, 1000);

  mostraErrore(errore, 'Troppi tentativi. Riprova fra ' + restano + ' secondi.');
}

// --------------------------------------------------------------- numeri

/* L'unico posto di tutto il progetto in cui i centesimi diventano euro. Se ti trovi
   a scrivere una virgola decimale fuori di qui, hai sbagliato qualcosa.
   Lo spazio prima del simbolo e' quello unificatore (\u00A0): tiene "1,00" e "€"
   sulla stessa riga. Scritto come codice perche' nel sorgente sarebbe invisibile. */
function euro(centesimi) {
  var segno = centesimi < 0 ? '-' : '';
  var v = Math.abs(Math.round(centesimi));
  return segno + Math.floor(v / 100) + ',' + String(v % 100).padStart(2, '0') + '\u00A0€';
}

/* Accetta "1,50", "1.50", "1", " 2,00 € ". Rifiuta tutto il resto — compreso "1,555",
   perche' un prezzo che non esiste in monete non si puo' incassare. */
function leggiPrezzo(testo) {
  var pulito = String(testo).trim().replace(/€/g, '').replace(/\s/g, '').replace(',', '.');
  if (!/^\d{1,4}(\.\d{1,2})?$/.test(pulito)) { return null; }
  var centesimi = Math.round(parseFloat(pulito) * 100);
  if (!Number.isFinite(centesimi) || centesimi <= 0 || centesimi > 100000) { return null; }
  return centesimi;
}

function prodottoCon(id) {
  for (var i = 0; i < stato.prodotti.length; i++) {
    if (stato.prodotti[i].id === id) { return stato.prodotti[i]; }
  }
  return null;
}

// Le righe che puntano a un prodotto cancellato non devono far crollare il conto.
function righeVive() {
  return stato.vendita.righe.filter(function (r) { return prodottoCon(r.id) !== null; });
}

function totale() {
  return righeVive().reduce(function (somma, r) {
    return somma + prodottoCon(r.id).prezzo * r.qta;
  }, 0);
}

function pezziNellaVendita() {
  return righeVive().reduce(function (n, r) { return n + r.qta; }, 0);
}

// --------------------------------------------------------------- schermo

function $(sel) { return document.querySelector(sel); }

function disegnaGriglia() {
  var griglia = $('#griglia-prodotti');
  griglia.textContent = '';

  if (stato.prodotti.length === 0) {
    var vuoto = document.createElement('p');
    vuoto.className = 'griglia-vuota';
    vuoto.textContent = 'Nessun prodotto. Vai su «Prodotti» e aggiungi il primo.';
    griglia.appendChild(vuoto);
    return;
  }

  stato.prodotti.forEach(function (p) {
    var quante = 0;
    stato.vendita.righe.forEach(function (r) { if (r.id === p.id) { quante = r.qta; } });

    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'prodotto' + (quante > 0 ? ' scelto' : '');
    b.dataset.id = p.id;
    b.setAttribute('aria-label', p.nome + ', ' + euro(p.prezzo) +
      (quante > 0 ? ', ' + quante + ' nel conto' : ''));

    var nome = document.createElement('span');
    nome.className = 'prodotto-nome';
    nome.textContent = p.nome;

    var prezzo = document.createElement('span');
    prezzo.className = 'prodotto-prezzo';
    prezzo.textContent = euro(p.prezzo);

    b.appendChild(nome);
    b.appendChild(prezzo);

    if (quante > 0) {
      var bollino = document.createElement('span');
      bollino.className = 'contatore';
      bollino.textContent = '×' + quante;
      b.appendChild(bollino);
    }

    griglia.appendChild(b);
  });
}

/* La lista della vendita e' alta una riga sola sul telefono - lo spazio in altezza e'
   dei prodotti, vedi la scheda dell'aspetto - e senza questo mostrerebbe sempre la
   PRIMA voce battuta: tocchi «Crackers» e leggi «Focaccia», cioe' la conferma che
   arriva agli occhi non e' quella del tocco che hai appena dato. Scorre solo se la
   voce e' davvero fuori, e di quel poco che basta: la lista non salta sotto il dito. */
function mostraLaVoceToccata(righe) {
  if (!ultimo_toccato) { return; }
  var li = righe.querySelector('[data-riga="' + ultimo_toccato + '"]');
  if (!li) { return; }

  var voce = li.getBoundingClientRect();
  var finestra = righe.getBoundingClientRect();
  if (voce.top < finestra.top) { righe.scrollTop += voce.top - finestra.top; }
  else if (voce.bottom > finestra.bottom) { righe.scrollTop += voce.bottom - finestra.bottom; }
}

function disegnaConto() {
  var righe = $('#righe');
  righe.textContent = '';

  var vive = righeVive();

  if (vive.length === 0) {
    var li = document.createElement('li');
    li.className = 'riga-vuota';
    li.textContent = 'Tocca un prodotto per cominciare';
    righe.appendChild(li);
  } else {
    vive.forEach(function (r) {
      var p = prodottoCon(r.id);
      var li = document.createElement('li');
      li.dataset.riga = r.id;

      var togli = document.createElement('button');
      togli.type = 'button';
      togli.className = 'togli';
      togli.dataset.togli = r.id;
      togli.textContent = '−';
      togli.setAttribute('aria-label', 'Togli un ' + p.nome);

      var nome = document.createElement('span');
      nome.className = 'riga-nome';
      nome.textContent = p.nome;

      var qta = document.createElement('span');
      qta.className = 'riga-qta';
      qta.textContent = '×' + r.qta;

      var somma = document.createElement('span');
      somma.className = 'riga-somma';
      somma.textContent = euro(p.prezzo * r.qta);

      li.appendChild(togli);
      li.appendChild(nome);
      li.appendChild(qta);
      li.appendChild(somma);
      righe.appendChild(li);
    });
    mostraLaVoceToccata(righe);
  }

  var da_pagare = totale();
  var dati = stato.vendita.contanti;

  $('#totale').textContent = euro(da_pagare);
  $('#ricevuto').textContent = euro(dati);

  var riquadro = $('#resto');
  var cifra = $('#resto-cifra');
  riquadro.className = 'resto';

  if (da_pagare === 0) {
    cifra.textContent = '—';
    $('#resto .resto-etichetta').textContent = 'Resto';
  } else if (dati === 0) {
    cifra.textContent = '—';
    $('#resto .resto-etichetta').textContent = 'Resto';
  } else if (dati < da_pagare) {
    riquadro.classList.add('manca');
    $('#resto .resto-etichetta').textContent = 'Mancano';
    cifra.textContent = euro(da_pagare - dati);
  } else if (dati === da_pagare) {
    riquadro.classList.add('pari');
    $('#resto .resto-etichetta').textContent = 'Resto';
    cifra.textContent = 'niente';
  } else {
    riquadro.classList.add('da-dare');
    $('#resto .resto-etichetta').textContent = 'Resto';
    cifra.textContent = euro(dati - da_pagare);
  }

  // Non si incassa a vuoto, e non si incassa se i soldi sul banco non bastano.
  $('#incassa').disabled = (da_pagare === 0) || (dati > 0 && dati < da_pagare);
  $('#annulla').disabled = (da_pagare === 0 && dati === 0);
}

function disegnaGiornata() {
  allineaGiornata();

  var g = stato.giornata;
  var parti = g.data.split('-');
  $('#data-oggi').textContent = 'Oggi è il ' + parti[2] + '/' + parti[1] + '/' + parti[0] + '.';

  /* Quanto ha fatto QUESTO dispositivo oggi: la cassa aperta adesso piu' quello che
     ha gia' archiviato oggi, se la cassa era gia' stata chiusa una volta. */
  var mio = { vendite: g.vendite, incasso: g.incasso, voci: {} };
  sommaVoci(mio.voci, g.voci);
  stato.mio.forEach(function (x) {
    if (x.data !== g.data) { return; }
    mio.vendite += x.vendite;
    mio.incasso += x.incasso;
    sommaVoci(mio.voci, x.voci);
  });

  // Quanto ha fatto il BAR oggi: il mio piu' quello degli altri dispositivi.
  var tutti = { vendite: mio.vendite, incasso: mio.incasso, voci: {} };
  sommaVoci(tutti.voci, mio.voci);

  var altri = giornateAltrui(g.data);
  altri.forEach(function (x) {
    tutti.vendite += x.vendite;
    tutti.incasso += x.incasso;
    sommaVoci(tutti.voci, x.voci);
  });

  $('#incasso-oggi').textContent = euro(tutti.incasso);
  $('#vendite-oggi').textContent = String(tutti.vendite);

  /* La riga piccola compare solo quando c'e' davvero qualcun altro: se batte cassa
     un dispositivo solo, ripetere due volte lo stesso numero confonde e basta. */
  $('#incasso-mio').textContent = altri.length > 0
    ? 'di cui su questo dispositivo ' + euro(mio.incasso)
    : '';

  var chiavi = Object.keys(tutti.voci);
  var pezzi_totali = riempiTabella($('#tabella-pezzi').querySelector('tbody'), tutti.voci);

  $('#pezzi-oggi').textContent = String(pezzi_totali);
  $('#tabella-pezzi').hidden = chiavi.length === 0;
  $('#giornata-vuota').hidden = chiavi.length > 0;

  // Si chiude la propria giornata, non quella degli altri.
  $('#chiudi-cassa').disabled = g.vendite === 0;
  descriviRete($('#stato-giornata'));

  /* Se una giornata e' finita nello storico senza che la cassa fosse chiusa a mano,
     qui lo si dice. Sparisce da solo appena si registra la prima vendita di oggi. */
  var vecchio = document.getElementById('avviso-precedente');
  if (vecchio) { vecchio.remove(); }

  var ultimo = stato.mio.length ? stato.mio[stato.mio.length - 1] : null;
  if (ultimo && ultimo.automatica && ultimo.data !== oggi() && g.vendite === 0) {
    var avviso = document.createElement('p');
    avviso.id = 'avviso-precedente';
    avviso.className = 'spiega';
    avviso.textContent = 'La cassa di ' + dataLunga(ultimo.data) + ' non era stata chiusa: ' +
      'ho archiviato io ' + euro(ultimo.incasso) + '. La trovi nello Storico.';
    $('#data-oggi').insertAdjacentElement('afterend', avviso);
  }
}

/* Riempie il corpo di una tabella con le voci di una giornata, dal prodotto piu' venduto
   al meno venduto. Restituisce quanti pezzi in tutto. Serve sia a Giornata sia a Storico. */
function riempiTabella(corpo, voci) {
  corpo.textContent = '';
  var pezzi = 0;

  Object.keys(voci).sort(function (a, b) {
    return voci[b].qta - voci[a].qta;
  }).forEach(function (k) {
    var v = voci[k];
    pezzi += v.qta;

    var tr = document.createElement('tr');
    var td1 = document.createElement('td');
    td1.textContent = v.nome;
    var td2 = document.createElement('td');
    td2.className = 'num';
    td2.textContent = String(v.qta);
    var td3 = document.createElement('td');
    td3.className = 'num';
    td3.textContent = euro(v.somma);
    tr.appendChild(td1); tr.appendChild(td2); tr.appendChild(td3);
    corpo.appendChild(tr);
  });

  return pezzi;
}

// --------------------------------------------------------------- storico

function totaliAnno(giorni) {
  return giorni.reduce(function (t, g) {
    t.incasso += g.incasso;
    t.vendite += g.vendite;
    t.pezzi += pezziDelGiorno(g);
    return t;
  }, { incasso: 0, vendite: 0, pezzi: 0 });
}

function rigaGiorno(g) {
  var li = document.createElement('li');
  li.className = 'giorno';
  li.dataset.data = g.data;

  var testa = document.createElement('button');
  testa.type = 'button';
  testa.className = 'giorno-testa';
  testa.setAttribute('aria-expanded', 'false');

  var freccia = document.createElement('span');
  freccia.className = 'giorno-freccia';
  freccia.setAttribute('aria-hidden', 'true');
  freccia.textContent = '▸';

  var data = document.createElement('span');
  data.className = 'giorno-data';
  data.textContent = dataLunga(g.data);

  if (g.automatica) {
    var nota = document.createElement('span');
    nota.className = 'giorno-nota';
    nota.textContent = 'cassa non chiusa a mano';
    data.appendChild(nota);
  }

  /* Chiusa senza rete: sta al sicuro qui e deve ancora arrivare agli altri. Se il
     server non e' nemmeno impostato la nota non ha senso e non compare: non c'e'
     nessun posto dove doveva andare. */
  if (g.da_inviare && window.Sincronia.configurato()) {
    var coda = document.createElement('span');
    coda.className = 'giorno-nota';
    coda.textContent = 'non ancora mandata al server';
    data.appendChild(coda);
  }

  var quanti = pezziDelGiorno(g);
  var pezzi = document.createElement('span');
  pezzi.className = 'giorno-pezzi';
  pezzi.textContent = quanti + (quanti === 1 ? ' pezzo' : ' pezzi');

  var cifra = document.createElement('span');
  cifra.className = 'giorno-cifra';
  cifra.textContent = euro(g.incasso);

  testa.appendChild(freccia);
  testa.appendChild(data);
  testa.appendChild(pezzi);
  testa.appendChild(cifra);
  li.appendChild(testa);

  return li;
}

/* Il dettaglio si costruisce solo quando si apre il giorno: un anno intero sono duecento
   giorni, e costruire duecento tabelle che nessuno guarda rallenterebbe l'apertura. */
function corpoGiorno(g) {
  var box = document.createElement('div');
  box.className = 'giorno-corpo';

  if (Object.keys(g.voci).length === 0) {
    var vuoto = document.createElement('p');
    vuoto.className = 'nota-vuota';
    vuoto.textContent = 'Di questo giorno è rimasto solo il totale, non il dettaglio dei prodotti.';
    box.appendChild(vuoto);
  } else {
    var tab = document.createElement('table');
    tab.className = 'tabella';
    var testa = document.createElement('thead');
    testa.innerHTML = '<tr><th>Prodotto</th><th class="num">Pezzi</th><th class="num">Incasso</th></tr>';
    var corpo = document.createElement('tbody');
    riempiTabella(corpo, g.voci);
    tab.appendChild(testa);
    tab.appendChild(corpo);
    box.appendChild(tab);
  }

  var riga = document.createElement('p');
  riga.className = 'spiega';
  riga.textContent = g.vendite + (g.vendite === 1 ? ' vendita' : ' vendite') +
    ' · incasso ' + euro(g.incasso);
  box.appendChild(riga);

  /* Il pulsante si costruisce SOLO se il server dice che questo dispositivo puo'
     modificare. Su tutti gli altri non esiste dentro la pagina: non e' nascosto,
     non c'e' proprio. E se anche qualcuno lo facesse comparire a forza, il server
     rifiuterebbe lo stesso - il controllo vero e' li', non qui.

     Sta dentro il giorno aperto e non sulla riga chiusa: per togliere una giornata
     bisogna prima averla aperta, cioe' aver visto cosa contiene. */
  if (window.Sincronia.puoModificare()) {
    var elimina = document.createElement('button');
    elimina.type = 'button';
    elimina.className = 'btn btn-elimina-giorno';
    elimina.dataset.eliminaGiorno = g.data;
    elimina.textContent = 'Togli questa giornata dai conti';
    box.appendChild(elimina);
  }

  return box;
}

/* Serve a togliere le prove: una giornata finta lasciata dentro si sommerebbe agli
   incassi veri fino alla fine dell'anno.

   Sul server non cancella niente: ci mette un segno sopra, e la giornata esce dai
   conti restando in tabella. E' la ragione per cui adesso la conferma non dice piu'
   «non si torna indietro»: non e' vero, e prometterlo sarebbe la cosa sbagliata da
   scrivere sotto un pulsante. */
function eliminaGiorno(data) {
  if (!window.Sincronia.puoModificare()) { return; }

  var g = null;
  giornateDellAnno().forEach(function (x) { if (x.data === data) { g = x; } });
  if (!g) { return; }

  var quante = g.vendite + (g.vendite === 1 ? ' vendita' : ' vendite');
  if (!window.confirm('Tolgo dai conti la giornata di ' + dataLunga(data) + '?\n\n' +
      euro(g.incasso) + ' in ' + quante + ' escono dai totali dell\'anno, su tutti i ' +
      'dispositivi.\n\nSul server la giornata resta scritta e si può rimettere.')) { return; }

  window.Sincronia.annulla(data).then(function () {
    stato.mio = stato.mio.filter(function (x) { return x.data !== data; });
    salva();
    return window.Sincronia.aggiorna();
  }).then(disegnaStorico, function (e) {
    disegnaStorico();
    window.alert('La giornata non è stata tolta: ' + (e.message || 'il server non risponde.'));
  });
}

function disegnaStorico() {
  var elenco = $('#elenco-giorni');
  elenco.textContent = '';

  /* Solo l'anno scolastico in corso. Prima il titolo si ricavava dalla prima
     giornata mai archiviata: adesso che non c'e' piu' un azzeramento di fine anno,
     quel modo avrebbe tenuto insieme anni diversi per sempre. */
  var giorni = giornateDellAnno();
  var t = totaliAnno(giorni);

  $('#titolo-anno').textContent = 'Anno scolastico ' + annoCorrente();
  $('#incasso-anno').textContent = euro(t.incasso);
  $('#giorni-anno').textContent = String(giorni.length);
  $('#vendite-anno').textContent = String(t.vendite);

  $('#storico-vuoto').hidden = giorni.length > 0;
  $('#scarica-anno').disabled = giorni.length === 0;
  descriviRete($('#stato-storico'));

  giorni.forEach(function (g) { elenco.appendChild(rigaGiorno(g)); });
}

function apriChiudiGiorno(li) {
  var testa = li.querySelector('.giorno-testa');
  var aperto = li.classList.toggle('aperto');
  testa.setAttribute('aria-expanded', aperto ? 'true' : 'false');
  li.querySelector('.giorno-freccia').textContent = aperto ? '▾' : '▸';

  var corpo = li.querySelector('.giorno-corpo');
  if (!aperto) {
    if (corpo) { corpo.hidden = true; }
    return;
  }

  if (!corpo) {
    var g = null;
    giornateDellAnno().forEach(function (x) { if (x.data === li.dataset.data) { g = x; } });
    if (!g) { return; }
    li.appendChild(corpoGiorno(g));
  } else {
    corpo.hidden = false;
  }
}

// --------------------------------------------------------------- riepilogo da salvare

function virgola(centesimi) {
  return (centesimi / 100).toFixed(2).replace('.', ',');
}

/* Un foglio che si apre con Excel o LibreOffice. Punto e virgola come separatore e
   virgola nei decimali: e' quello che si aspetta un foglio di calcolo italiano. */
function riepilogoAnno() {
  var giorni = giornateDellAnno();
  var t = totaliAnno(giorni);
  var anno = annoCorrente();
  var r = [];

  r.push('Bar scolastico - riepilogo anno ' + anno);
  r.push('');
  r.push('Giorno;Data;Vendite;Pezzi;Incasso');

  giorni.forEach(function (g) {
    r.push(dataLunga(g.data, true) + ';' + g.data + ';' + g.vendite + ';' +
           pezziDelGiorno(g) + ';' + virgola(g.incasso));
  });

  r.push('TOTALE;;' + t.vendite + ';' + t.pezzi + ';' + virgola(t.incasso));
  r.push('');
  r.push('Dettaglio per prodotto');
  r.push('Data;Prodotto;Pezzi;Incasso');

  giorni.forEach(function (g) {
    Object.keys(g.voci).forEach(function (k) {
      var v = g.voci[k];
      r.push(g.data + ';' + v.nome + ';' + v.qta + ';' + virgola(v.somma));
    });
  });

  return r.join('\r\n');
}

function scaricaRiepilogo() {
  if (giornateDellAnno().length === 0) { return; }

  var anno = annoCorrente().replace('/', '-');
  var nome = 'bar-scolastico-' + anno + '.csv';

  // Il segno iniziale dice a Excel che il file e' in UTF-8: senza, le accentate si rompono.
  var blob = new Blob(['﻿' + riepilogoAnno()], { type: 'text/csv;charset=utf-8' });
  var indirizzo = URL.createObjectURL(blob);

  var a = document.createElement('a');
  a.href = indirizzo;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(function () { URL.revokeObjectURL(indirizzo); }, 2000);
}

function disegnaProdotti() {
  var elenco = $('#elenco-prodotti');
  elenco.textContent = '';

  /* La domanda che decide tutta questa schermata. Se il server dice di no, i
     pulsanti non vengono costruiti: sul dispositivo di uno studente non sono
     nascosti, non esistono proprio dentro la pagina. */
  var puoi = window.Sincronia.puoModificare();

  $('#form-prodotto').hidden = !puoi;
  $('#codice-dispositivo').textContent = window.Sincronia.dispositivo();
  descriviRete($('#stato-prodotti'));

  $('#spiega-prodotti').textContent = puoi
    ? 'I prezzi si scrivono con la virgola: 1,50. Le modifiche valgono subito e arrivano da sole su tutti gli altri dispositivi.'
    : 'Questo dispositivo può vedere il listino ma non cambiarlo. I prezzi si modificano da un dispositivo autorizzato, e la modifica arriva qui da sola.';

  if (stato.prodotti.length === 0) {
    var vuoto = document.createElement('li');
    vuoto.className = 'nota-vuota';
    vuoto.textContent = puoi
      ? 'Nessun prodotto: aggiungine uno qui sotto.'
      : 'Nessun prodotto nel listino.';
    elenco.appendChild(vuoto);
    return;
  }

  stato.prodotti.forEach(function (p, indice) {
    var li = document.createElement('li');
    li.dataset.id = p.id;

    var nome = document.createElement('span');
    nome.className = 'voce-nome';
    nome.textContent = p.nome;

    var prezzo = document.createElement('span');
    prezzo.className = 'voce-prezzo';
    prezzo.textContent = euro(p.prezzo);

    if (!puoi) {
      li.appendChild(nome); li.appendChild(prezzo);
      elenco.appendChild(li);
      return;
    }

    var su = document.createElement('button');
    su.type = 'button'; su.className = 'mini'; su.dataset.su = p.id;
    su.textContent = '↑'; su.disabled = indice === 0;
    su.setAttribute('aria-label', 'Sposta ' + p.nome + ' in alto');

    var giu = document.createElement('button');
    giu.type = 'button'; giu.className = 'mini'; giu.dataset.giu = p.id;
    giu.textContent = '↓'; giu.disabled = indice === stato.prodotti.length - 1;
    giu.setAttribute('aria-label', 'Sposta ' + p.nome + ' in basso');

    var modifica = document.createElement('button');
    modifica.type = 'button'; modifica.className = 'mini'; modifica.dataset.modifica = p.id;
    modifica.textContent = '✎';
    modifica.setAttribute('aria-label', 'Modifica ' + p.nome);

    var elimina = document.createElement('button');
    elimina.type = 'button'; elimina.className = 'mini elimina'; elimina.dataset.elimina = p.id;
    elimina.textContent = '✕';
    elimina.setAttribute('aria-label', 'Elimina ' + p.nome);

    li.appendChild(nome); li.appendChild(prezzo);
    li.appendChild(su); li.appendChild(giu);
    li.appendChild(modifica); li.appendChild(elimina);
    elenco.appendChild(li);
  });
}

function disegnaTutto() {
  disegnaGriglia();
  disegnaConto();
}

// --------------------------------------------------------------- vendita

// L'ultimo prodotto toccato, in piu' o in meno: serve a tenerlo in vista nella lista.
var ultimo_toccato = null;

function aggiungiPezzo(id) {
  if (!prodottoCon(id)) { return; }
  ultimo_toccato = id;
  var trovata = false;
  stato.vendita.righe.forEach(function (r) {
    if (r.id === id) { r.qta += 1; trovata = true; }
  });
  if (!trovata) { stato.vendita.righe.push({ id: id, qta: 1 }); }
  salva();
  disegnaTutto();

  /* Un colpetto di vibrazione: nel rumore dell'intervallo l'occhio e' gia' occupato a
     guardare il cliente, e il dito deve sapere da solo che il tocco e' andato. Si chiede
     solo dopo un tocco vero: il browser rifiuta le altre e riempie la console di errori. */
  if (navigator.vibrate && (!navigator.userActivation || navigator.userActivation.isActive)) {
    navigator.vibrate(15);
  }
  tieniAccesoLoSchermo();
}

/* Uno schermo che si spegne ogni trenta secondi mentre c'e' la fila e' un difetto
   grosso quanto un conto sbagliato. Dove il browser non lo permette, pazienza. */
var lucchetto_schermo = null;

function tieniAccesoLoSchermo() {
  if (!('wakeLock' in navigator) || lucchetto_schermo) { return; }
  try {
    navigator.wakeLock.request('screen').then(function (l) {
      lucchetto_schermo = l;
      l.addEventListener('release', function () { lucchetto_schermo = null; });
    }).catch(function () { /* niente da fare */ });
  } catch (e) { /* niente da fare */ }
}

function togliPezzo(id) {
  ultimo_toccato = id;
  stato.vendita.righe = stato.vendita.righe.map(function (r) {
    return r.id === id ? { id: r.id, qta: r.qta - 1 } : r;
  }).filter(function (r) { return r.qta > 0; });
  salva();
  disegnaTutto();
}

function svuotaVendita() {
  ultimo_toccato = null;
  stato.vendita = { righe: [], contanti: 0 };
  salva();
  disegnaTutto();
}

var incasso_in_corso = false;

function incassa() {
  // Due tocchi involontari sullo stesso pulsante non devono registrare due vendite.
  if (incasso_in_corso) { return; }
  var da_pagare = totale();
  if (da_pagare === 0) { return; }

  var dati = stato.vendita.contanti;
  if (dati > 0 && dati < da_pagare) { return; }

  incasso_in_corso = true;
  window.setTimeout(function () { incasso_in_corso = false; }, 600);

  allineaGiornata();

  righeVive().forEach(function (r) {
    var p = prodottoCon(r.id);
    var voce = stato.giornata.voci[p.id] || { nome: p.nome, qta: 0, somma: 0 };
    voce.nome = p.nome;
    voce.qta += r.qta;
    voce.somma += p.prezzo * r.qta;
    stato.giornata.voci[p.id] = voce;
  });

  stato.giornata.vendite += 1;
  stato.giornata.incasso += da_pagare;

  svuotaVendita();
}

// --------------------------------------------------------------- schede

/* Su «Prodotti» c'era una domanda di conferma, perche' era l'unica cosa che
   tenesse fuori chi non doveva entrarci. Adesso non serve piu': chi non ha il
   permesso vede il listino e non trova niente da premere, e il server rifiuta le
   modifiche comunque. Una conferma che non protegge da niente si impara a premere
   senza leggerla, ed e' peggio di non averla. */
function vaiA(nome) {
  ['cassa', 'giornata', 'storico', 'prodotti'].forEach(function (n) {
    document.getElementById('schermata-' + n).hidden = (n !== nome);
  });

  Array.prototype.forEach.call(document.querySelectorAll('.scheda'), function (b) {
    var attiva = b.dataset.vai === nome;
    b.classList.toggle('attiva', attiva);
    b.setAttribute('aria-selected', attiva ? 'true' : 'false');
  });

  if (nome === 'giornata') { disegnaGiornata(); }
  if (nome === 'storico') { allineaGiornata(); disegnaStorico(); }
  if (nome === 'prodotti') { disegnaProdotti(); }
  if (nome === 'cassa') { disegnaTutto(); }
}

// --------------------------------------------------------------- avvio

function costruisciTagli() {
  var contenitore = $('#tagli');
  contenitore.textContent = '';

  TAGLI.forEach(function (t) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'taglio';
    b.dataset.taglio = String(t);
    b.textContent = t % 100 === 0 ? String(t / 100) + '\u00A0€' : euro(t);
    contenitore.appendChild(b);
  });

  var esatto = document.createElement('button');
  esatto.type = 'button';
  esatto.className = 'taglio esatto';
  esatto.id = 'taglio-esatto';
  esatto.textContent = 'Conta giusti';
  contenitore.appendChild(esatto);
}

function collegaEventi() {
  Array.prototype.forEach.call(document.querySelectorAll('.scheda'), function (b) {
    b.addEventListener('click', function () { vaiA(b.dataset.vai); });
  });

  $('#griglia-prodotti').addEventListener('click', function (e) {
    var b = e.target.closest('.prodotto');
    if (b) { aggiungiPezzo(b.dataset.id); }
  });

  $('#righe').addEventListener('click', function (e) {
    var b = e.target.closest('[data-togli]');
    if (b) { togliPezzo(b.dataset.togli); }
  });

  $('#tagli').addEventListener('click', function (e) {
    var b = e.target.closest('.taglio');
    if (!b) { return; }
    if (b.id === 'taglio-esatto') {
      stato.vendita.contanti = totale();
    } else {
      stato.vendita.contanti += parseInt(b.dataset.taglio, 10);
    }
    salva();
    disegnaConto();
  });

  $('#azzera-contanti').addEventListener('click', function () {
    stato.vendita.contanti = 0;
    salva();
    disegnaConto();
  });

  $('#annulla').addEventListener('click', function () {
    if (pezziNellaVendita() > 0) {
      if (!window.confirm('Butto via questa vendita e ricomincio?')) { return; }
    }
    svuotaVendita();
  });

  $('#incassa').addEventListener('click', incassa);

  /* Chiudere la cassa vuol dire mettere via l'incasso di una giornata: chiede la
     password, cosi' non succede per un tocco sbagliato mentre c'e' la fila. La
     password la sanno tutti quelli che usano l'app - il suo mestiere qui e' fermare
     la mano, non riconoscere chi la muove. */
  $('#chiudi-cassa').addEventListener('click', function () {
    if (stato.giornata.vendite === 0) { return; }

    chiediPassword({
      titolo: 'Chiudi la cassa',
      invito: 'Incasso di oggi su questo dispositivo: ' + euro(stato.giornata.incasso) +
        '. La giornata finisce nello Storico e i totali tornano a zero per domani.',
      pulsante: 'Chiudi la cassa',
      annullabile: true
    }, function () {
      archivia(stato.giornata, false);
      stato.giornata = giornataVuota();
      salva();
      spingiCoda();
      disegnaGiornata();
      vaiA('storico');     // subito il riepilogo di quello che si e' appena chiuso
    });
  });

  $('#elenco-giorni').addEventListener('click', function (e) {
    var cancella = e.target.closest('[data-elimina-giorno]');
    if (cancella) { eliminaGiorno(cancella.dataset.eliminaGiorno); return; }

    var testa = e.target.closest('.giorno-testa');
    if (testa) { apriChiudiGiorno(testa.parentNode); }
  });

  $('#scarica-anno').addEventListener('click', scaricaRiepilogo);

  /* Qui c'era «Azzera e comincia un anno nuovo». Tolto l'8 settembre 2026: era il
     solo pulsante capace di distruggere in un colpo l'intera traccia dei soldi della
     scuola, e serviva una volta l'anno. Adesso lo Storico mostra da solo il solo
     anno in corso, e gli anni vecchi restano sul server senza che nessuno debba
     premere niente per farli sparire. */

  $('#elenco-prodotti').addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (!b) { return; }

    if (b.dataset.elimina) {
      var p = prodottoCon(b.dataset.elimina);
      if (!p) { return; }
      if (!window.confirm('Elimino «' + p.nome + '» dalla cassa?')) { return; }
      var prima_elimina = copiaProdotti();
      stato.prodotti = stato.prodotti.filter(function (x) { return x.id !== p.id; });
      stato.vendita.righe = stato.vendita.righe.filter(function (r) { return r.id !== p.id; });
      salvaProdotti(prima_elimina);
      return;
    }

    if (b.dataset.su || b.dataset.giu) {
      var id = b.dataset.su || b.dataset.giu;
      var passo = b.dataset.su ? -1 : 1;
      var i = stato.prodotti.findIndex(function (x) { return x.id === id; });
      var j = i + passo;
      if (i < 0 || j < 0 || j >= stato.prodotti.length) { return; }
      var prima_sposta = copiaProdotti();
      var appoggio = stato.prodotti[i];
      stato.prodotti[i] = stato.prodotti[j];
      stato.prodotti[j] = appoggio;
      salvaProdotti(prima_sposta);
      return;
    }

    if (b.dataset.modifica) { apriModifica(b.dataset.modifica); }
  });

  $('#form-prodotto').addEventListener('submit', function (e) {
    e.preventDefault();
    var nome = $('#nuovo-nome').value.trim();
    var prezzo = leggiPrezzo($('#nuovo-prezzo').value);
    var errore = $('#errore-prodotto');

    if (nome.length === 0) { mostraErrore(errore, 'Manca il nome del prodotto.'); return; }
    if (prezzo === null) { mostraErrore(errore, 'Il prezzo non va bene. Scrivilo così: 1,20'); return; }

    errore.hidden = true;
    var prima = copiaProdotti();
    stato.prodotti.push({ id: nuovoId(), nome: nome, prezzo: prezzo });
    $('#nuovo-nome').value = '';
    $('#nuovo-prezzo').value = '';
    $('#nuovo-nome').focus();
    salvaProdotti(prima);
  });

  // --------------------------------------------------------- il lucchetto

  $('#form-lucchetto').addEventListener('submit', function (e) {
    e.preventDefault();

    var campo = $('#lucchetto-campo');
    var errore = $('#lucchetto-errore');
    if ($('#lucchetto-ok').disabled) { return; }

    impronta(campo.value).then(function (imp) {
      if (imp === IMPRONTA_PASSWORD) {
        tentativi_sbagliati = 0;
        var poi = dopo_il_lucchetto;
        chiudiLucchetto();
        if (poi) { poi(); }
        return;
      }

      tentativi_sbagliati += 1;
      campo.value = '';
      mostraErrore(errore, 'Password sbagliata.');

      var pausa = Math.min(30, (tentativi_sbagliati - 2) * 5);
      if (pausa > 0) { fermaPer(pausa); }
    }).catch(function () {
      /* Succede se la pagina non e' aperta ne' in https ne' su localhost: il
         browser li' non presta il pezzo che serve a controllare la password. */
      mostraErrore(errore, 'Non riesco a controllare la password: apri l’app dal suo ' +
        'indirizzo, non con un doppio clic sul file.');
    });
  });

  // Solo per la chiusura di cassa: dall'ingresso non si torna indietro.
  $('#lucchetto-lascia').addEventListener('click', chiudiLucchetto);
}

function mostraErrore(nodo, testo) {
  nodo.textContent = testo;
  nodo.hidden = false;
}

/* La modifica avviene dentro la riga stessa: due caselle al posto del nome e del
   prezzo. Niente finestre di sistema, che su telefono tagliano il testo. */
function apriModifica(id) {
  var p = prodottoCon(id);
  if (!p) { return; }
  var li = document.querySelector('#elenco-prodotti li[data-id="' + id + '"]');
  if (!li) { return; }

  li.textContent = '';
  li.classList.add('in-modifica');

  var nome = document.createElement('input');
  nome.type = 'text'; nome.value = p.nome; nome.maxLength = 24; nome.className = 'campo-nome';
  nome.setAttribute('aria-label', 'Nome del prodotto');

  var prezzo = document.createElement('input');
  prezzo.type = 'text'; prezzo.inputMode = 'decimal'; prezzo.className = 'campo-prezzo';
  prezzo.value = (p.prezzo / 100).toFixed(2).replace('.', ',');
  prezzo.setAttribute('aria-label', 'Prezzo in euro');

  var salvaBtn = document.createElement('button');
  salvaBtn.type = 'button'; salvaBtn.className = 'mini'; salvaBtn.textContent = '✓';
  salvaBtn.setAttribute('aria-label', 'Salva');

  var annullaBtn = document.createElement('button');
  annullaBtn.type = 'button'; annullaBtn.className = 'mini'; annullaBtn.textContent = '✕';
  annullaBtn.setAttribute('aria-label', 'Lascia com’era');

  salvaBtn.addEventListener('click', function () {
    var n = nome.value.trim();
    var c = leggiPrezzo(prezzo.value);
    if (n.length === 0 || c === null) {
      prezzo.style.borderColor = 'var(--rosso)';
      return;
    }
    var prima = copiaProdotti();
    p.nome = n;
    p.prezzo = c;
    salvaProdotti(prima);
  });

  annullaBtn.addEventListener('click', disegnaProdotti);

  li.appendChild(nome); li.appendChild(prezzo);
  li.appendChild(salvaBtn); li.appendChild(annullaBtn);
  nome.focus();
  nome.select();
}

/* Quando pubblico una versione nuova, la pagina gia' aperta non si ricarica da sola:
   ricaricare mentre qualcuno sta battendo tre panini e' un difetto, non una funzione.
   Si avvisa e si aspetta un tocco. */
function avvisaVersioneNuova() {
  if (document.getElementById('striscia-aggiornamento')) { return; }

  var striscia = document.createElement('div');
  striscia.id = 'striscia-aggiornamento';
  striscia.className = 'striscia';

  var testo = document.createElement('span');
  testo.textContent = 'C’è una versione nuova della cassa.';

  var bottone = document.createElement('button');
  bottone.type = 'button';
  bottone.textContent = 'Aggiorna';
  bottone.addEventListener('click', function () { window.location.reload(); });

  striscia.appendChild(testo);
  striscia.appendChild(bottone);
  document.body.appendChild(striscia);
}

function collegaServiceWorker() {
  if (!('serviceWorker' in navigator)) { return; }

  // Se all'avvio nessuno ci controlla, e' la prima installazione: il cambio di
  // controllo che arrivera' fra poco non e' un aggiornamento, e non va annunciato.
  var prima_installazione = !navigator.serviceWorker.controller;

  navigator.serviceWorker.addEventListener('controllerchange', function () {
    if (!prima_installazione) { avvisaVersioneNuova(); }
  });

  window.addEventListener('load', function () {
    navigator.serviceWorker
      .register('service-worker.js', { updateViaCache: 'none' })
      .catch(function () { /* senza offline si lavora lo stesso */ });
  });
}

/* Ridisegna solo la schermata che si sta guardando davvero. Serve quando arrivano
   notizie dal server: un prezzo cambiato altrove, una giornata mandata da un altro
   dispositivo. Le schermate nascoste si ridisegnano da sole quando si aprono. */
function ridisegnaQuelloCheSiVede() {
  if (!document.getElementById('schermata-cassa').hidden) { disegnaTutto(); }
  if (!document.getElementById('schermata-giornata').hidden) { disegnaGiornata(); }
  if (!document.getElementById('schermata-storico').hidden) { disegnaStorico(); }

  /* Prodotti no, se una riga e' aperta in modifica: ridisegnarla mentre qualcuno
     sta scrivendo un prezzo vuol dire cancellargli quello che ha scritto. */
  if (!document.getElementById('schermata-prodotti').hidden &&
      !document.querySelector('#elenco-prodotti li.in-modifica')) {
    disegnaProdotti();
  }
}

function arrivanoNotizie() {
  var listino_cambiato = adottaProdotti();
  spingiCoda();

  /* Il primo dispositivo autorizzato che si collega porta sul server il listino che
     ha in casa. Senza questo il server resterebbe senza prodotti finche' non se ne
     cambia uno a mano, e gli altri dispositivi vedrebbero una cassa vuota. */
  if (!window.Sincronia.prodotti() && window.Sincronia.puoModificare() &&
      stato.prodotti.length > 0) {
    window.Sincronia.mandaProdotti(stato.prodotti).catch(function () { /* al giro dopo */ });
  }

  if (listino_cambiato) { disegnaTutto(); }
  ridisegnaQuelloCheSiVede();
}

// Quello che succede dopo che la password e' stata accettata.
function entra() {
  disegnaTutto();

  var confini = estremiAnno(annoCorrente());
  window.Sincronia.guarda(confini.dal, confini.al);
  window.Sincronia.quandoCambia(arrivanoNotizie);
  window.Sincronia.avvia();

  // L'app puo' restare aperta per giorni: al rientro si ricontrolla la data e,
  // se serve, si riprende lo schermo acceso.
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState !== 'visible') { return; }
    allineaGiornata();
    if (!document.getElementById('schermata-giornata').hidden) { disegnaGiornata(); }
    tieniAccesoLoSchermo();
  });
}

function avvia() {
  stato = carica();
  allineaGiornata();
  costruisciTagli();
  collegaEventi();
  collegaServiceWorker();

  /* Prima il lucchetto, poi tutto il resto. Si chiede a ogni apertura: chi prende in
     mano il telefono e tocca l'icona non entra. Durante l'intervallo l'app resta
     aperta, quindi costa una digitazione al giorno per dispositivo. */
  chiediPassword({
    titolo: 'Cassa del bar',
    invito: 'Scrivi la password per entrare.',
    pulsante: 'Entra',
    annullabile: false
  }, entra);
}

avvia();
