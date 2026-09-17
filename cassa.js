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
   venti euro. Sono otto: insieme a «Buono» e a «Conta giusti», che ne occupano due
   per uno, riempiono esatte tre righe da quattro. Cambiarne il numero vuol dire
   rifare quel conto in stile.css, altrimenti resta un buco in fondo alla griglia.

   Il taglio da 50 € c'era ed e' stato tolto il 15 settembre 2026 per fare posto a
   «Buono»: con nove tagli le dodici caselle erano gia' piene, e l'unico modo di
   aggiungere un pulsante largo era una riga in piu' - sul telefono da 320x690
   misurata in 122 px tolti ai prodotti, cioe' nessun prodotto intero piu'
   visibile. Con 50 € in mano il bar non potrebbe dare il resto su una pizzetta
   comunque: si contano i tagli piu' piccoli, o si batte «Conta giusti». */
var TAGLI = [10, 20, 50, 100, 200, 500, 1000, 2000];

/* Quanto puo' valere al massimo un buono, in centesimi: cento euro. Non e' una
   regola della scuola, e' la rete che prende il dito scivolato sullo zero - un
   buono da 500 euro non esiste, uno da 50,00 battuto come 500,00 si'. */
var MASSIMO_BUONO = 10000;

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

/* 'incasso' e' quanto si e' VENDUTO, buoni e crediti compresi: non cambia
   significato rispetto a prima, cosi' le giornate vecchie restano vere.

   'buoni' e 'crediti' sono due PARTI di quello, mai qualcosa che gli si aggiunge:
   il buono che nessuno ha pagato, e la merce uscita dal banco senza denaro. I
   contanti - quelli che devono essere nella scatola a fine giornata - sono quello
   che resta:

     contanti = incasso - buoni - crediti

   Senza questa divisione la cassa non torna, e il foglio che va alla scuola
   dichiara soldi che la scuola non ha visto. */
function giornataVuota() {
  return { data: oggi(), vendite: 0, incasso: 0, buoni: 0, crediti: 0, voci: {} };
}

function statoIniziale() {
  return {
    prodotti: PRODOTTI_ESEMPIO.map(function (p) {
      return { id: nuovoId(), nome: p.nome, prezzo: p.prezzo };
    }),
    vendita: { righe: [], contanti: 0, buono: 0 },
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

/* Un numero che rappresenta dei soldi o dei pezzi, cosi' come lo pretende il server:
   intero e non negativo. Tutto il resto - la virgola, il segno meno, «620» scritto
   come stringa, NaN - vale zero.

   Non e' pignoleria e non e' nemmeno solo pulizia: server.js questi numeri li
   rifiuta, e li rifiuta PER SEMPRE. Una giornata con un incasso di 1234,5678 o di
   -750 non arriva mai, e prima del 17 settembre 2026 restava a riprovare in eterno
   tenendo ferme tutte le altre, § spingiCoda. Si taglia qui, quando si rilegge da
   casa, che e' l'unico punto in cui quella roba puo' entrare. */
function interoNonNegativo(x) {
  if (!Number.isFinite(x)) { return 0; }
  var n = Math.round(x);
  return n > 0 ? n : 0;
}

/* Le voci di una giornata, ripulite. Non e' pignoleria: una 'qta' che non e' un
   numero fa comparire «0due» al posto dei pezzi venduti, e una voce nulla fa saltare
   in aria le schermate Giornata e Storico - schermata morta, e per rimetterla in
   piedi bisognerebbe svuotare la memoria del browser, cioe' buttare via anche le
   giornate che non sono ancora arrivate al server. Il server fa questo stesso
   controllo su quello che riceve; qui si fa su quello che si rilegge da casa.

   Il segno conta quanto il tipo: una voce con qta -5 e somma -300 - «Resi», scritta a
   mano da qualcuno - passava indenne e il server la rifiutava per sempre. Una voce
   negativa non si sistema, si butta: non esiste un mezzo panino venduto in meno. */
function vociBuone(grezze) {
  var pulite = {};
  if (!grezze || typeof grezze !== 'object') { return pulite; }

  Object.keys(grezze).forEach(function (k) {
    var v = grezze[k];
    if (!v || typeof v !== 'object') { return; }
    if (typeof v.nome !== 'string' || v.nome.length === 0) { return; }
    if (!Number.isFinite(v.qta) || !Number.isFinite(v.somma)) { return; }
    if (Math.round(v.qta) < 0 || Math.round(v.somma) < 0) { return; }
    pulite[k] = { nome: v.nome, qta: Math.round(v.qta), somma: Math.round(v.somma) };
  });

  return pulite;
}

/* La parte di una giornata pagata coi buoni, ripulita come tutto il resto.

   Una giornata scritta prima del 15 settembre 2026 non ha questo campo, e allora
   vale zero: e' la verita', perche' i buoni non esistevano. E non puo' mai
   superare l'incasso, perche' e' una parte di quello - se il numero che arriva
   dice il contrario, il numero e' rotto e si scarta. */
function quotaBuoni(g) {
  if (!g || !Number.isFinite(g.buoni) || g.buoni <= 0) { return 0; }
  var b = Math.round(g.buoni);
  var totale = Number.isFinite(g.incasso) ? Math.round(g.incasso) : 0;
  return b > totale ? totale : b;
}

/* La parte di una giornata uscita dal banco senza denaro: la merce data a credito.
   Stessa storia dei buoni, con una differenza che conta: il tetto non e' l'incasso
   ma QUELLO CHE RESTA dopo i buoni. Se ognuno dei due si fermasse all'incasso per
   conto suo, una giornata da 10 € con 10 € di buoni e 10 € di crediti passerebbe
   tutti e due i controlli, e i contanti - che sono la differenza - verrebbero
   meno dieci.

   I buoni tengono la precedenza perche' sono il campo piu' vecchio: le giornate
   che esistono hanno quello, e non deve cambiare valore da sotto. */
function quotaCrediti(g) {
  if (!g || !Number.isFinite(g.crediti) || g.crediti <= 0) { return 0; }
  var c = Math.round(g.crediti);
  var totale = Number.isFinite(g.incasso) ? Math.round(g.incasso) : 0;
  var resta = totale - quotaBuoni(g);
  if (resta < 0) { resta = 0; }
  return c > resta ? resta : c;
}

/* La frase che spiega un incasso: quanto di quello che si e' venduto e' finito
   davvero nella scatola, e quanto no. Sta in un posto solo perche' compare in
   cinque - Giornata, Storico, il giorno aperto, il foglio Word e la chiusura di
   cassa - e cinque copie divergono senza dirlo.

   Vuota quando non c'e' niente da spiegare: un giorno pagato tutto in contanti
   non dice niente di piu' di prima. */
function comeSiEPagato(incasso, buoni, crediti) {
  if (buoni === 0 && crediti === 0) { return ''; }

  var pezzi = [euro(incasso - buoni - crediti) + ' in contanti'];
  if (buoni > 0) { pezzi.push(euro(buoni) + ' in buoni'); }
  if (crediti > 0) { pezzi.push(euro(crediti) + ' a credito'); }

  return 'di cui ' + pezzi.slice(0, -1).join(', ') + ' e ' + pezzi[pezzi.length - 1];
}

function pezziDelGiorno(g) {
  var voci = g.voci || {};
  return Object.keys(voci).reduce(function (n, k) {
    return n + (Number.isFinite(voci[k] && voci[k].qta) ? voci[k].qta : 0);
  }, 0);
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
    /* Il prezzo congelato non c'era prima del 17 settembre 2026, e una vendita
       lasciata a meta' la sera prima si rilegge qui senza. A quella riga si da' il
       prezzo del listino di ADESSO: e' l'unico che si conosca, e chiedere al cassiere
       di indovinare quello di ieri non ha senso. Se invece il prodotto non c'e' piu',
       la riga si scarta come si e' sempre fatto - senza prodotto e senza prezzo
       congelato non resta niente da scrivere sul conto, nemmeno il nome.

       Da qui in avanti il caso non si presenta piu': aggiungiPezzo scrive il prezzo
       al primo tocco, e chi legge questo stato lo trova gia' dentro. */
    s.vendita.righe = letto.vendita.righe.filter(function (r) {
      return r && r.id && Number.isFinite(r.qta) && r.qta > 0;
    }).map(function (r) {
      var p = s.prodotti.filter(function (x) { return x.id === r.id; })[0] || null;
      var prezzo = Number.isFinite(r.prezzo) && r.prezzo >= 0
        ? Math.round(r.prezzo) : (p ? p.prezzo : null);
      if (prezzo === null) { return null; }
      var nome = typeof r.nome === 'string' && r.nome.length > 0
        ? r.nome : (p ? p.nome : 'Prodotto tolto');
      return { id: r.id, qta: Math.round(r.qta), prezzo: prezzo, nome: nome };
    }).filter(function (r) { return r !== null; });
    s.vendita.contanti = Number.isFinite(letto.vendita.contanti) && letto.vendita.contanti > 0
      ? Math.round(letto.vendita.contanti) : 0;
    s.vendita.buono = Number.isFinite(letto.vendita.buono) && letto.vendita.buono > 0
      ? Math.min(Math.round(letto.vendita.buono), MASSIMO_BUONO) : 0;
  }

  if (letto.giornata && typeof letto.giornata.data === 'string') {
    /* I numeri si raddrizzano PRIMA di chiedere a quotaBuoni e quotaCrediti quanto
       vale ogni parte: quelle due prendono l'incasso come tetto, e su un incasso
       negativo darebbero un tetto negativo, cioe' due numeri rotti al posto di uno. */
    var giornata_pulita = {
      data: letto.giornata.data,
      vendite: interoNonNegativo(letto.giornata.vendite),
      incasso: interoNonNegativo(letto.giornata.incasso),
      buoni: letto.giornata.buoni,
      crediti: letto.giornata.crediti
    };
    s.giornata = {
      data: giornata_pulita.data,
      vendite: giornata_pulita.vendite,
      incasso: giornata_pulita.incasso,
      buoni: quotaBuoni(giornata_pulita),
      crediti: quotaCrediti(giornata_pulita),
      voci: vociBuone(letto.giornata.voci)
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
      // Stessa regola della cassa aperta: prima si raddrizzano i numeri, poi si divide.
      var pulita = {
        incasso: interoNonNegativo(g.incasso),
        buoni: g.buoni,
        crediti: g.crediti
      };
      return {
        data: g.data,
        vendite: interoNonNegativo(g.vendite),
        incasso: pulita.incasso,
        buoni: quotaBuoni(pulita),
        crediti: quotaCrediti(pulita),
        voci: vociBuone(g.voci),
        automatica: !!g.automatica,
        inviata: g.inviata === true,
        /* Fuori dai conti: il server l'ha presa ma quel giorno era stato tolto. La
           riga resta qui per intero - e' il totale che si continua a mandare - ma
           non entra in nessun totale. Un salvataggio vecchio non ce l'ha: vale no. */
        fuori: g.fuori === true,
        // Quante volte il server l'ha rifiutata, e perche': § spingiCoda, § descriviRete.
        tentativi: interoNonNegativo(g.tentativi),
        motivo: typeof g.motivo === 'string' ? g.motivo.slice(0, 120) : ''
      };
    });
  }

  /* Formato vecchio: la giornata non chiusa stava da sola in 'precedente' e si perdeva
     al giorno dopo. Adesso c'e' lo storico, quindi la si recupera li' dentro.

     Il Number.isFinite qui non c'era, ed era l'unico ramo che ne fosse senza: un
     incasso scritto come stringa - «620» - passava, perche' '620' > 0 e' vero. Poi
     archivia() ci sommava dentro la chiusura dopo, e in JavaScript '620' + 100 fa
     '620100': 6,20 € piu' 1,00 € diventavano 6.201,00 €, e da li' in poi ogni somma
     dell'anno era una concatenazione di stringhe. */
  if (letto.precedente && typeof letto.precedente === 'object' &&
      typeof letto.precedente.data === 'string' &&
      Number.isFinite(letto.precedente.incasso) && letto.precedente.incasso > 0) {
    var gia = s.mio.some(function (g) { return g.data === letto.precedente.data; });
    if (!gia) {
      s.mio.push({
        data: letto.precedente.data,
        vendite: interoNonNegativo(letto.precedente.vendite),
        incasso: interoNonNegativo(letto.precedente.incasso),
        buoni: 0,
        crediti: 0,
        voci: {},
        automatica: true,
        inviata: false,
        tentativi: 0,
        motivo: ''
      });
    }
  }

  s.mio.sort(function (a, b) { return a.data < b.data ? -1 : (a.data > b.data ? 1 : 0); });

  return s;
}

/* Vero quando l'ultimo salvataggio non e' riuscito: memoria del browser piena, o
   spenta dalle impostazioni. Non e' salvato da nessuna parte - e' proprio quello che
   non si riesce a fare - e vive finche' l'app resta aperta. */
var salvataggio_fallito = false;

/* Scrivere lo stato, e ACCORGERSI se non ci si riesce.

   Qui c'era «niente da fare», e il costo misurato e' questo: dieci salvataggi
   rifiutati, lo schermo che dice 8,50 € e il disco che ne conserva 4,00. Quei 4,50 €
   sparivano al primo ricaricamento della pagina, senza che niente lo avesse mai
   detto. E se la memoria si riempie proprio alla chiusura di cassa e' peggio: la
   giornata arriva al server, sul telefono non ne resta traccia, riaprendo risulta
   ancora aperta e riparte una seconda volta.

   Non si avvisa con window.alert: si salva a ogni tocco di prodotto, e un alert per
   vendita bloccherebbe il banco con la fila davanti. Si accende una striscia, che
   resta li' finche' il guaio c'e' e sparisce da sola quando passa. */
function salva() {
  try {
    window.localStorage.setItem(CHIAVE, JSON.stringify(stato));
    if (salvataggio_fallito) { salvataggio_fallito = false; avvisaSalvataggio(); }
  } catch (e) {
    if (!salvataggio_fallito) { salvataggio_fallito = true; avvisaSalvataggio(); }
  }
}

// La striscia del salvataggio che non riesce, appesa e staccata una volta sola.
var striscia_salvataggio = null;

/* Sopra le schede, dove sta gia' l'avviso della versione nuova: e' l'unico posto
   che si vede anche dalla schermata Cassa, che e' quella su cui si sta quando
   succede. Non copre i pulsanti della vendita - un avviso non si mette mai davanti
   al lavoro, § avvisaVersioneNuova - e non chiede di premere niente, perche' non
   c'e' niente da premere: i conti vanno letti dallo schermo e scritti a mano.

   Tutto dentro un try: se il disegno non riesce, salva() non deve fallire per
   quello. Un salvataggio che va a buon fine e un avviso che non si disegna sono due
   guai diversi, e il secondo non deve diventare il primo. */
function avvisaSalvataggio() {
  try {
    if (!salvataggio_fallito) {
      if (striscia_salvataggio) { striscia_salvataggio.remove(); striscia_salvataggio = null; }
      return;
    }
    if (striscia_salvataggio) { return; }

    var striscia = document.createElement('div');
    striscia.id = 'striscia-salvataggio';
    striscia.className = 'striscia attenzione';

    var testo = document.createElement('span');
    testo.textContent = 'I conti NON si stanno salvando su questo dispositivo: ' +
      'la memoria del browser è piena. Non chiudere l’app e segna a mano quello ' +
      'che vedi sullo schermo.';

    striscia.appendChild(testo);

    var testata = document.querySelector('.testata');
    testata.insertBefore(striscia, testata.querySelector('.schede'));
    striscia_salvataggio = striscia;
  } catch (e) { /* senza striscia resta la riga di descriviRete: § lo stato della rete */ }
}

/* Somma le voci di una giornata dentro un'altra: per ogni prodotto, i pezzi e
   l'incasso. Serve ad archiviare, e serve a mettere insieme quello che hanno fatto
   dispositivi diversi nello stesso giorno. */
function sommaVoci(dentro, da) {
  var buone = vociBuone(da);
  Object.keys(buone).forEach(function (k) {
    var v = buone[k];
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
   ripartire anche se il vecchio era gia' arrivato.

   Una riga fuori dai conti si somma come tutte le altre e resta fuori: e' il modo
   in cui quello che si batte in un giorno tolto continua ad andare al server senza
   entrare in nessun totale. Se non si sommasse - se la riga fosse stata buttata via
   e ne nascesse una nuova - il TOTALE non sarebbe piu' un totale, e l'invio dopo
   cancellerebbe quello di prima. Era il difetto del 17 settembre 2026. */
function archivia(giornata, automatica) {
  if (!giornata || (giornata.vendite === 0 && giornata.incasso === 0)) { return; }

  var esistente = null;
  stato.mio.forEach(function (g) { if (g.data === giornata.data) { esistente = g; } });

  if (esistente) {
    esistente.vendite += giornata.vendite;
    esistente.incasso += giornata.incasso;
    esistente.buoni = (esistente.buoni || 0) + (giornata.buoni || 0);
    esistente.crediti = (esistente.crediti || 0) + (giornata.crediti || 0);
    sommaVoci(esistente.voci, giornata.voci);
    if (!automatica) { esistente.automatica = false; }
    esistente.inviata = false;
    /* Il totale e' cambiato, quindi quello che si manda non e' piu' quello che il
       server ha rifiutato: i tentativi ripartono da zero. Se il difetto era nei
       numeri - un dettaglio prodotti storto, un incasso non intero - adesso puo'
       essere passato, e non deve restare bloccata per una colpa vecchia. */
    esistente.tentativi = 0;
    esistente.motivo = '';
    return;
  }

  stato.mio.push({
    data: giornata.data,
    vendite: giornata.vendite,
    incasso: giornata.incasso,
    buoni: giornata.buoni || 0,
    crediti: giornata.crediti || 0,
    voci: giornata.voci,
    automatica: !!automatica,
    inviata: false,
    fuori: false,
    // Quante volte il server l'ha rifiutata, e con che parole: § spingiCoda.
    tentativi: 0,
    motivo: ''
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

  /* Le giornate fuori dai conti non contano da nessuna parte: stanno qui perche' sono il
     totale da mandare al server, non perche' entrino in un totale. E non coprono nemmeno
     la riga che ne ha il server: il giorno che quel giorno viene rimesso dentro dal
     pannello, il server ricomincia a nominarlo e dev'essere quella riga a farsi vedere -
     anche prima che questo dispositivo gli rimandi qualcosa. */
  var mie_date = {};
  stato.mio.forEach(function (g) { if (!g.fuori) { mie_date[g.data] = true; } });

  function aggiungi(g, non_inviata) {
    if (dal && g.data < dal) { return; }
    if (al && g.data > al) { return; }

    var d = per_data[g.data];
    if (!d) {
      d = per_data[g.data] = {
        data: g.data, vendite: 0, incasso: 0, buoni: 0, crediti: 0, voci: {},
        automatica: false, da_inviare: false
      };
    }
    d.vendite += g.vendite;
    d.incasso += g.incasso;
    d.buoni += quotaBuoni(g);
    d.crediti += quotaCrediti(g);
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

  stato.mio.forEach(function (g) { if (!g.fuori) { aggiungi(g, !g.inviata); } });

  return Object.keys(per_data).sort().map(function (k) { return per_data[k]; });
}

function giornateDellAnno() {
  var e = estremiAnno(annoCorrente());
  return giornateUnite(e.dal, e.al);
}

/* Le MIE righe gia' archiviate di un giorno. Di solito sono le copie locali. Ma se di
   quel giorno qui non e' rimasto niente, quella buona e' la riga che ne ha il server: e'
   l'unica rimasta, e va contata.

   Non e' un caso raro. Fino alla 13 l'app buttava via la copia di una giornata che il
   server metteva fuori dai conti, e svuotando i dati del sito succede lo stesso. Il
   risultato era che Giornata dimenticava proprio quello che aveva battuto questo
   apparecchio - contava la cassa aperta e le righe degli ALTRI, § giornateAltrui - mentre
   lo Storico quella riga la contava, § giornateUnite. Due schermate con due numeri
   diversi per lo stesso giorno, e ogni apparecchio sbagliava del suo importo: il telefono
   di 7,50 €, il tablet di 10,50 €, il PC - che la copia ce l'aveva ancora - di niente.

   Una riga fuori dai conti non conta qui come non conta altrove: se e' l'unica che ho,
   vale zero e il server non la nomina, quindi nemmeno il ripiego la trova. */
function mieGiornateArchiviate(data) {
  var mie = stato.mio.filter(function (g) { return g.data === data && !g.fuori; });
  if (mie.length > 0) { return mie; }

  var mio_codice = window.Sincronia.dispositivo();
  return window.Sincronia.giornate().filter(function (g) {
    return g.data === data && g.dispositivo === mio_codice;
  });
}

// Le righe che gli ALTRI dispositivi hanno mandato per un certo giorno.
function giornateAltrui(data) {
  var mio_codice = window.Sincronia.dispositivo();
  return window.Sincronia.giornate().filter(function (g) {
    return g.data === data && g.dispositivo !== mio_codice;
  });
}

/* Quante giornate al massimo risponde il server in una lettura. Se ne tornassero
   esattamente tante, la risposta potrebbe essere stata tagliata, e allora «il server
   non la nomina» non vorrebbe piu' dire «li' non c'e'». */
var TETTO_GIORNATE_SERVER = 2000;

/* Una giornata mia che il server ha gia' ricevuto, e che adesso non nomina piu', li' e'
   stata tolta: annullata da un altro dispositivo, o cancellata dal pannello. Va messa
   fuori dai conti anche qui. E se ricomincia a nominarla - qualcuno l'ha rimessa dentro
   dal pannello - torna a contare: la stessa regola nei due sensi, perche' una sola delle
   due direzioni lascerebbe questo dispositivo indietro per sempre.

   Senza questa regola una giornata tolta non se ne andava piu': «Togli questa giornata
   dai conti» toglie la riga soltanto dal dispositivo su cui si preme, e su tutti gli
   altri che l'avevano battuta restava a gonfiare i totali dell'anno. Il guaio e' che non
   si vedeva - su ogni altro schermo i conti erano giusti, e il telefono che sbagliava era
   proprio quello che nessuno confrontava.

   Fuori dai conti, non buttata via. Sono due cose diverse e la differenza sta tutta in
   cosa succede dopo: la riga che resta e' il totale di quel giorno su questo dispositivo,
   quindi la chiusura di cassa successiva ci si somma dentro e al server arriva ancora un
   totale. Buttandola via - come si faceva fino al 17 settembre 2026 - l'invio dopo
   portava soltanto le vendite nuove, e sul server cancellava quelle di prima.

   Tre guardie, perche' «il server non la nomina» voglia dire davvero «non c'e' piu'» e non
   «non gliel'ho chiesta» o «non gliel'ho ancora mandata»:
     - si guarda solo da collegati, cioe' su una risposta arrivata adesso;
     - solo le giornate gia' partite: quelle in coda restano dentro i conti, e' il loro
       posto;
     - solo dentro l'anno scolastico che abbiamo chiesto, e solo se la risposta non e'
       stata tagliata dal tetto.

   Il prezzo, scritto perche' non sia una sorpresa il giorno che capita: se il server
   perdesse una giornata, i dispositivi la toglierebbero dai totali dietro di lui. E' la
   stessa scelta di sempre - lo storico e' del server, qui c'e' una coda - ma adesso costa
   meno di prima, perche' nessuno butta via niente: il giorno che la riga torna sul
   server, i conti tornano da soli. */
function allineaGiornateTolte() {
  if (!window.Sincronia.configurato() || !window.Sincronia.collegato()) { return false; }

  var righe = window.Sincronia.giornate();
  if (righe.length >= TETTO_GIORNATE_SERVER) { return false; }

  var mio_codice = window.Sincronia.dispositivo();
  var sul_server = {};
  righe.forEach(function (g) {
    if (g.dispositivo === mio_codice) { sul_server[g.data] = true; }
  });

  var e = estremiAnno(annoCorrente());
  var cambiato = false;

  stato.mio.forEach(function (g) {
    if (!g.inviata) { return; }
    if (g.data < e.dal || g.data > e.al) { return; }

    var fuori = sul_server[g.data] !== true;
    if (g.fuori === fuori) { return; }

    g.fuori = fuori;
    if (fuori) { segnaUscitaDalConto(g.data); }
    cambiato = true;
  });

  if (!cambiato) { return false; }
  salva();
  return true;
}

// --------------------------------------------------------------- la coda d'invio

var invio_in_corso = false;
var coda_da_rifare = false;

/* I giorni che il server ha preso e messo fuori dai conti mentre l'app era aperta. Non si
   salvano da nessuna parte: servono a dirlo una volta a chi sta guardando lo schermo,
   perche' una giornata che esce dai totali senza che nessuno lo dica e' esattamente il
   modo in cui i soldi della scuola si perdono di vista.

   Un giorno per volta, non un invio per volta: chiudere due volte la cassa dentro un
   giorno tolto e' un fatto solo, e contarlo due volte faceva dire «2 giornate» a chi ne
   aveva una. */
var tolte_dal_server = [];

function segnaUscitaDalConto(data) {
  if (tolte_dal_server.indexOf(data) === -1) { tolte_dal_server.push(data); }
}

/* Quelli da segnalare adesso. Non basta ricordare cos'e' successo: bisogna ricontrollare
   che sia ancora vero. Un giorno rimesso dentro dal pannello torna nei totali da solo, e
   l'avviso deve sparire con lui - fino al 17 settembre 2026 restava scritto fino alla
   chiusura dell'app, e diceva una cosa falsa sotto i numeri giusti.

   In piu' c'e' sempre OGGI, se oggi e' fuori dai conti: li' si sta battendo cassa dentro
   un giorno che non conta da nessuna parte, ed e' il momento in cui serve saperlo. */
function giorniFuoriDaSegnalare() {
  var fuori = {};
  stato.mio.forEach(function (g) { if (g.fuori) { fuori[g.data] = true; } });

  var elenco = tolte_dal_server.filter(function (d) { return fuori[d] === true; });
  if (fuori[oggi()] === true && elenco.indexOf(oggi()) === -1) { elenco.push(oggi()); }
  return elenco.sort();
}

/* Quante volte si riprova a mandare LA STESSA giornata quando non si capisce cos'e'
   andato storto, prima di dire che non partira' mai piu'.

   E' una rete di sicurezza, non piu' il modo normale di decidere: da quando
   sincronia.js dice se una risposta e' arrivata e con che codice, § esitoDelRifiuto,
   un «no» del server si riconosce al primo colpo e una linea caduta si riprova per
   sempre. Il contatore serve solo ai casi che restano in mezzo - una risposta
   arrivata con un codice che non dice niente, tipo un 200 con dentro un «no», o un
   proxy che restituisce una pagina HTML al posto della risposta.

   Tre, non cinque: adesso copre pochi casi strani, e non c'e' motivo di girare a
   vuoto per due minuti buoni prima di dirlo a chi sta al banco. */
var TENTATIVI_PRIMA_DI_ARRENDERSI = 3;

/* Una giornata che ha esaurito i tentativi: si smette di riprovarla, si continua a
   tenerla qui dentro coi suoi soldi, e la si dice a chi guarda lo schermo,
   § descriviRete. Non si butta via mai: e' il totale di quel giorno su questo
   dispositivo, e il giorno che il difetto si sistema riparte da sola. */
function giornataBloccata(g) {
  return !g.inviata && (g.tentativi || 0) >= TENTATIVI_PRIMA_DI_ARRENDERSI;
}

function giornateBloccate() {
  return stato.mio.filter(giornataBloccata);
}

/* «La linea e' caduta» oppure «il server ha detto di no, e lo dira' sempre». La
   differenza cambia tutto: la prima si riprova all'infinito, la seconda no.

   Dal 17 settembre 2026 l'informazione c'e', e arriva da sincronia.js: l'errore che
   nasce da una risposta vera se lo porta scritto addosso ('rispostaDelServer') e si
   porta anche il codice. Da li' si legge tutto:

     - niente marchio: non e' arrivata nessuna risposta - rete staccata, otto secondi
       scaduti, wifi della scuola giu'. PASSEGGERO, si riprova sempre. E' il caso
       normale dell'intervallo, e venti giorni in coda non devono arrendersi per un
       pomeriggio senza rete;
     - marchio e codice 4xx: il server ha guardato quello che gli e' arrivato e ha
       detto di no. Un «no» del genere e' sulla cosa mandata - una data del 1970, un
       incasso non intero, un dettaglio prodotti storto - e domani sara' lo stesso
       no. DEFINITIVO, e si vede al primo colpo;
     - marchio e codice 5xx: il server si e' rotto lui. La giornata non c'entra
       niente e fra un minuto puo' passare. PASSEGGERO;
     - il 429 e' l'eccezione dentro i 4xx: «troppi dispositivi registrati» vuol dire
       riprova piu' tardi, non e' un difetto di questa giornata;
     - tutto il resto - marchio ma codice che non dice niente, tipo un 200 con
       dentro un «no», o un proxy che risponde HTML - e' AMBIGUO, e li' decide il
       contatore, § TENTATIVI_PRIMA_DI_ARRENDERSI.

   Non si guarda piu' se siamo collegati: serviva quando l'unico indizio era il tipo
   dell'errore. Adesso il marchio dice da solo che una risposta e' arrivata, che e'
   la stessa cosa detta meglio. */
function esitoDelRifiuto(guasto) {
  if (!guasto || !guasto.rispostaDelServer) { return 'passeggero'; }

  var codice = Number(guasto.stato);
  if (codice === 429) { return 'passeggero'; }
  if (codice >= 500) { return 'passeggero'; }
  if (codice >= 400 && codice < 500) { return 'definitivo'; }
  return 'ambiguo';
}

/* Le giornate mie che non sono ancora arrivate al server. Si riprova a ogni giro di
   controllo e a ogni rientro nell'app: chiudere la cassa senza rete non deve far
   perdere niente, e infatti non lo fa - i conti restano qui e partono da soli.

   Se qualcuno chiede di spingere mentre un tentativo e' ancora per aria - succede
   quando la rete torna proprio mentre quello di prima sta scadendo - la richiesta
   non si butta via: si rifa' appena l'altro ha finito. Una giornata che aspetta e'
   l'unica cosa qui dentro che non deve restare indietro.

   Ogni giornata si tenta PER CONTO SUO. Fino al 17 settembre 2026 la catena si
   spezzava al primo rifiuto - il .catch() stava fuori dal reduce - e le giornate
   dietro non venivano nemmeno tentate: un tablet con l'orologio al 1970 che
   chiudeva una cassa da 12,50 € teneva ferme venti giornate vere, 887,70 €,
   ritentate ogni venticinque secondi all'infinito senza che niente lo dicesse.
   Adesso il rifiuto di una non tocca le altre. */
function spingiCoda() {
  if (!window.Sincronia.configurato()) { return Promise.resolve(); }
  if (invio_in_corso) { coda_da_rifare = true; return Promise.resolve(); }

  var rimaste = stato.mio.filter(function (g) { return !g.inviata && !giornataBloccata(g); });
  if (rimaste.length === 0) { return Promise.resolve(); }

  invio_in_corso = true;

  var cambiato = false;

  return rimaste.reduce(function (catena, g) {
    return catena.then(function () {
      return window.Sincronia.mandaGiornata(g).then(function (esito) {
        /* Il server risponde due cose diverse. «Presa»: la giornata e' dentro i conti.
           Oppure «presa, ma quel giorno era stato tolto dai conti».

           In tutti e due i casi la copia RESTA qui, e quello che cambia e' soltanto se
           conta: una giornata fuori dai conti non entra in nessun totale, ne' qui ne'
           altrove - che e' lo scopo della regola - ma continua a essere il totale di
           quel giorno su questo dispositivo, ed e' quello che si rimanda.

           Fino al 17 settembre 2026 qui la copia si buttava via, e la conseguenza non
           si vedeva da nessuna parte: la chiusura di cassa dopo ripartiva da zero,
           mandava soltanto le vendite nuove, e il server - che riscrive la riga, mai la
           somma - cancellava quelle di prima. Tre invii, 23,50 € spariti dai totali e
           nemmeno recuperabili rimettendo dentro il giorno, perche' la riga da
           rimettere dentro era gia' stata sovrascritta. */
        var era_fuori = g.fuori === true;
        g.inviata = true;
        g.fuori = !!(esito && esito.annullata);
        g.tentativi = 0;
        g.motivo = '';
        if (g.fuori !== era_fuori) { cambiato = true; }
        if (g.fuori) { segnaUscitaDalConto(g.data); }
        salva();
      }, function (guasto) {
        /* Questa non e' partita. La catena CONTINUA lo stesso: il secondo argomento
           di then() e' quello che tiene in piedi la fila, perche' riporta la catena
           sul binario buono invece di lasciarla rifiutata fino in fondo.

           Poi si guarda che guasto e', § esitoDelRifiuto. Un «no» del server
           consuma in un colpo solo tutti i tentativi: non c'e' niente da aspettare,
           domani dira' la stessa cosa, e far girare la coda a vuoto per altri due
           giri servirebbe solo a ritardare l'avviso a chi sta al banco.

           Il motivo si tiene per scriverlo a schermo: «non parte» senza il perche'
           non aiuta nessuno a capire che il difetto e' l'orologio del tablet. */
        var come = esitoDelRifiuto(guasto);
        if (come === 'passeggero') { return; }

        g.tentativi = come === 'definitivo'
          ? TENTATIVI_PRIMA_DI_ARRENDERSI
          : (g.tentativi || 0) + 1;
        g.motivo = String((guasto && guasto.message) || 'il server ha detto di no').slice(0, 120);
        if (giornataBloccata(g)) { cambiato = true; }
        salva();
      });
    });
  }, Promise.resolve()).catch(function () {
    /* Rete di sicurezza. Qui non ci arriva piu' il rifiuto di una giornata - quello
       lo prende il then() qui sopra, una giornata per volta - ma se ci arrivasse
       qualcos'altro, 'invio_in_corso' deve tornare falso lo stesso: restasse vero,
       la coda non ripartirebbe mai piu'. */
  }).then(function () {
    invio_in_corso = false;
    if (cambiato) { ridisegnaQuelloCheSiVede(); }
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
  /* La vendita aperta NON si tocca. Qui prima si buttavano via le righe che puntavano
     a un prodotto sparito: un altro dispositivo riscriveva il listino con id nuovi e
     il carrello si svuotava da solo, senza un avviso, con le pizzette gia' in mano al
     cliente. Adesso ogni riga sa quanto costa e come si chiama, § il prezzo
     congelato, e il listino nuovo comincia a valere dalla vendita dopo. */
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
   listini diversi vogliono dire due prezzi diversi allo stesso banco.

   «Quello che c'era prima» e' il LISTINO, e soltanto quello. La vendita aperta qui
   non si tocca ne' all'andata ne' al ritorno, ed e' una regola da difendere: la
   richiesta puo' stare per aria fino a otto secondi, e in quegli otto secondi il
   cassiere batte. Rimettere a posto anche le righe vorrebbe dire cancellargli i
   pezzi aggiunti nel frattempo - lo stesso guaio di prima con la maschera nuova.

   Il guaio di prima: fino al 17 settembre 2026 eliminare un prodotto toglieva anche
   la sua riga dal conto, e al rifiuto del server il listino tornava indietro e la
   riga no. A schermo si leggeva «Il listino non è stato cambiato: il server non
   risponde», la Pizzetta era di nuovo li', e 6,00 € erano spariti dal conto in corso
   - col cliente che aveva le pizzette in mano. Adesso nessuno tocca il conto, quindi
   non c'e' niente da rimettere. */
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
    salva();
    disegnaProdotti();
    /* Anche la griglia e il conto: i prezzi del listino si vedono sui pulsanti dei
       prodotti, e quelli sono tornati indietro. Le righe della vendita no, perche'
       il prezzo se lo sono congelato al tocco. */
    disegnaTutto();
    window.alert('Il listino non è stato cambiato: ' + (e.message || 'il server non risponde.'));
  });
}

/* Una riga sola, tenue, che dice come sta il collegamento. Non deve gridare, ma non
   deve nemmeno mancare: senza, non si saprebbe mai se i conti sono arrivati. */
function descriviRete(nodo) {
  if (!nodo) { return; }
  nodo.className = 'stato-rete';

  /* Prima di qualunque discorso sul server: se non si riesce nemmeno a scrivere qui,
     non c'e' niente di piu' urgente da dire. La striscia in testata lo dice gia' a
     chi sta alla cassa, § salva(); questa riga lo ripete nelle tre schermate dove si
     guardano i conti, che sono quelle da cui si va a controllare se tornano. */
  if (salvataggio_fallito) {
    nodo.classList.add('attenzione');
    nodo.textContent = 'I conti non si stanno salvando su questo dispositivo: la ' +
      'memoria del browser è piena. Quello che vedi sullo schermo c’è, ma chiudendo ' +
      'l’app si perde. Segnalo a mano prima di chiudere.';
    return;
  }

  if (!window.Sincronia.configurato()) {
    nodo.textContent = 'Server non impostato: i conti restano su questo dispositivo, ' +
      'non si vedono altrove, e da qui si può cambiare tutto. È l’app di prima. ' +
      'Per collegare i dispositivi si scrive l’indirizzo del server in sincronia.js.';
    return;
  }

  /* Prima di tutto il resto: le giornate che al server non arriveranno mai, perche'
     le rifiuta e continuera' a rifiutarle. Viene prima persino dei giorni tolti dai
     conti, perche' li' i soldi sul server ci sono e si possono rimettere dentro con
     un tocco dal pannello, mentre qui non ci sono mai arrivati - e finche' nessuno
     lo dice, «Sto mandando 21 giornate al server» resta scritto per sempre e sembra
     tutto a posto.

     Il perche' si scrive per intero, con le parole del server: «data non valida» su
     un giorno del 1970 dice da solo che e' l'orologio del tablet, e senza quello
     resterebbe da indovinare. */
  var bloccate = giornateBloccate();

  if (bloccate.length > 0) {
    nodo.classList.add('attenzione');
    nodo.textContent = bloccate.length === 1
      ? 'La cassa di ' + dataLunga(bloccate[0].data) + ' non riesce ad arrivare al ' +
        'server: ' + (bloccate[0].motivo || 'il server la rifiuta') + '. I conti ' +
        'restano qui e contano nei totali, ma quel giorno va sistemato a mano.'
      : bloccate.length + ' giornate non riescono ad arrivare al server (' +
        bloccate.map(function (g) {
          return dataLunga(g.data) + ': ' + (g.motivo || 'rifiutata');
        }).join('; ') + '). I conti restano qui e contano nei totali, ma quei ' +
        'giorni vanno sistemati a mano.';
    return;
  }

  /* Poi, se e' successo: una giornata e' arrivata al server e li' e'
     rimasta fuori dai conti, perche' quel giorno era stato tolto. E' piu' importante di
     sapere se siamo collegati - sono soldi battuti che non entrano in nessun totale - e
     la riga lo dice finche' l'app resta aperta. */
  var fuori = giorniFuoriDaSegnalare();

  if (fuori.length > 0) {
    nodo.classList.add('attenzione');
    nodo.textContent = fuori.length === 1
      ? 'La cassa di ' + dataLunga(fuori[0]) + ' è arrivata al server, ma quel ' +
        'giorno era stato tolto dai conti: là resta scritta e si può rimettere, nei totali no.'
      : fuori.length + ' giornate sono arrivate al server, ma quei giorni erano ' +
        'stati tolti dai conti: là restano scritte e si possono rimettere, nei totali no.';
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

/* ------------------------------------------------- il prezzo congelato

   Una riga della vendita e' { id, qta, prezzo, nome }: si porta dietro il prezzo e
   il nome del momento in cui il prodotto e' stato toccato, e non li rilegge piu' dal
   listino. Il listino nuovo vale dalla vendita dopo.

   Prima non era cosi', e succedevano due cose. La prima: adottaProdotti() adotta il
   listino del server ogni venticinque secondi, e un carrello aperto cambiava totale
   sotto le dita del cassiere - 3,00 € annunciati al cliente, 6,00 € chiesti dalla
   cassa, senza che niente si muovesse sullo schermo tranne il numero. La seconda: se
   il listino nuovo aveva id nuovi, le righe non trovavano piu' il loro prodotto e il
   carrello si svuotava da solo, in silenzio, con la merce gia' sul banco.

   Decisione della proprietaria, 17 settembre 2026: si congela. Il prezzo che il
   cliente si e' sentito dire e' quello che paga. */
function prezzoDiRiga(r) {
  /* Una riga senza prezzo e' una riga di prima del congelamento, o costruita a mano:
     vale il listino di adesso, e se il prodotto non c'e' piu' vale zero - ma quella
     riga righeVive() l'ha gia' buttata via, § qui sotto. */
  if (Number.isFinite(r.prezzo) && r.prezzo >= 0) { return Math.round(r.prezzo); }
  var p = prodottoCon(r.id);
  return p ? p.prezzo : 0;
}

// Come sopra per il nome: quello congelato, se no quello del listino, se no un ripiego.
function nomeDiRiga(r) {
  if (typeof r.nome === 'string' && r.nome.length > 0) { return r.nome; }
  var p = prodottoCon(r.id);
  return p ? p.nome : 'Prodotto tolto';
}

/* Le righe che contano. Una riga il cui prodotto e' sparito dal listino NON si butta
   piu' via: la merce e' gia' sul banco e il cliente la sta aspettando, e adesso la
   riga sa da sola quanto costa e come si chiama. Si scartano solo le righe che non
   sanno ne' l'uno ne' l'altro, che senza il prodotto non si possono nemmeno scrivere
   nella lista. */
function righeVive() {
  return stato.vendita.righe.filter(function (r) {
    return prodottoCon(r.id) !== null || Number.isFinite(r.prezzo);
  });
}

function totale() {
  return righeVive().reduce(function (somma, r) {
    return somma + prezzoDiRiga(r) * r.qta;
  }, 0);
}

function pezziNellaVendita() {
  return righeVive().reduce(function (n, r) { return n + r.qta; }, 0);
}

/* ---------------------------------------------------------------- il buono

   Un buono NON e' denaro: lo studente l'ha guadagnato facendo qualcosa, e quando
   lo spende nella scatola non entra niente. Da qui le tre regole qui sotto, che
   stanno in un posto solo perche' il conto non si ripeta in giro per il file.

   Il buono si applica SEMPRE per primo contro il totale. Cosi' il risultato non
   dipende dall'ordine dei tocchi: che il cassiere batta prima i tagli o prima il
   buono, quello che lo studente deve tirare fuori e' lo stesso. */
function buonoUsato() {
  var t = totale();
  return stato.vendita.buono > t ? t : stato.vendita.buono;
}

function daPagareInContanti() {
  return totale() - buonoUsato();
}

/* Quello che avanza sul buono. Non e' un resto da dare: e' il valore che il buono
   si porta dietro da quel momento in poi, e si scrive a penna sul buono di carta
   prima di restituirlo. Se finisse nel riquadro grande del resto - quello verde,
   che vuol dire «ridai questi soldi» - uno studente con la fila davanti tirerebbe
   fuori dalla cassa contanti veri per un buono che nessuno ha pagato. */
function restoDelBuono() {
  var avanzo = stato.vendita.buono - totale();
  return avanzo > 0 ? avanzo : 0;
}

/* ---------------------------------------------------------------- il credito

   Quanto resterebbe a credito se la vendita si chiudesse adesso: quello che il
   buono non copre, meno i contanti gia' sul banco. La merce esce dal banco e il
   denaro no - la scuola resta creditrice, e chi deve si scrive sul quaderno.

   E' lo stesso numero che il riquadro grande scrive in rosso quando dice
   «Mancano», ma il pulsante ce l'ha ANCHE QUANDO IL RIQUADRO TACE, ed e' voluto:
   con i contanti a zero e nessun buono «Mancano» non compare, perche' li' lo zero
   vuol dire «non li ho contati» - e quello e' proprio il caso piu' comune del
   credito, lo studente che non ha niente in tasca. Legare il pulsante al rosso lo
   renderebbe irraggiungibile proprio quando serve. */
function creditoPossibile() {
  var manca = daPagareInContanti() - stato.vendita.contanti;
  return manca > 0 ? manca : 0;
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
    /* Subito dopo un incasso in cui e' avanzato qualcosa sul buono, questa riga
       dice cosa scriverci sopra. E' il punto dove l'occhio va da solo appena la
       vendita si chiude, e non costa niente perche' la riga c'era gia'. Sparisce
       al primo tocco della vendita dopo. */
    if (promemoria) {
      li.className = 'riga-vuota promemoria';
      li.textContent = promemoria;
    } else {
      li.className = 'riga-vuota';
      li.textContent = 'Tocca un prodotto per cominciare';
    }
    righe.appendChild(li);
  } else {
    vive.forEach(function (r) {
      /* Nome e prezzo si prendono dalla RIGA, non dal listino: sono quelli del
         momento in cui il prodotto e' stato toccato, § il prezzo congelato. Cosi'
         la lista dice le stesse cifre del totale anche mentre il listino cambia,
         e regge una riga il cui prodotto non esiste piu'. */
      var nome_riga = nomeDiRiga(r);
      var prezzo_riga = prezzoDiRiga(r);
      var li = document.createElement('li');
      li.dataset.riga = r.id;

      var togli = document.createElement('button');
      togli.type = 'button';
      togli.className = 'togli';
      togli.dataset.togli = r.id;
      togli.textContent = '−';
      togli.setAttribute('aria-label', 'Togli un ' + nome_riga);

      var nome = document.createElement('span');
      nome.className = 'riga-nome';
      nome.textContent = nome_riga;

      var qta = document.createElement('span');
      qta.className = 'riga-qta';
      qta.textContent = '×' + r.qta;

      var somma = document.createElement('span');
      somma.className = 'riga-somma';
      somma.textContent = euro(prezzo_riga * r.qta);

      li.appendChild(togli);
      li.appendChild(nome);
      li.appendChild(qta);
      li.appendChild(somma);
      righe.appendChild(li);
    });
    mostraLaVoceToccata(righe);
  }

  var da_pagare = totale();
  var in_contanti = daPagareInContanti();
  var dati = stato.vendita.contanti;
  var buono = stato.vendita.buono;

  /* Quando i contanti sul banco non bastano a coprire quello che il buono non
     copre. La condizione ha due strade perche' uno zero vuol dire due cose
     diverse:

     - senza buono, «contanti a zero» vuol dire «non li ho contati». Battere i
       tagli non e' mai stato obbligatorio: si prendono i soldi e si incassa. Se
       lo zero bloccasse la vendita, ogni pizzetta pagata con la moneta giusta
       costerebbe un tocco in piu', con la fila davanti;
     - con un buono, invece, il cassiere ha gia' dichiarato COME si paga, e la
       parte che il buono non copre deve risultare. Li' lo zero e' un buco.

     Senza questa distinzione, un buono da 5,00 € su un ordine da 7,50 € lasciava
     «Incassa» acceso: la vendita passava e la giornata registrava 2,50 € di
     contanti che nella scatola non erano mai entrati. */
  var mancano_contanti = (dati > 0 || buono > 0) && dati < in_contanti;

  $('#totale').textContent = euro(da_pagare);
  $('#ricevuto').textContent = euro(dati);
  disegnaBuono();
  disegnaCredito();

  var riquadro = $('#resto');
  var cifra = $('#resto-cifra');
  riquadro.className = 'resto';

  /* Nel riquadro grande ci va SEMPRE e SOLO il denaro: quello che il cassiere
     deve restituire, o quello che manca. Quello che avanza sul buono sta sul
     pulsante del buono, perche' non e' denaro e non deve uscire dalla cassa.
     Tutti i conti qui sotto si fanno sulla parte in contanti, non sul totale. */
  if (da_pagare === 0) {
    cifra.textContent = '—';
    $('#resto .resto-etichetta').textContent = 'Resto';
  } else if (dati === 0 && in_contanti === 0) {
    // Il buono copre tutta la spesa: non si tocca un soldo.
    riquadro.classList.add('col-buono');
    $('#resto .resto-etichetta').textContent = 'Pagato col buono';
    cifra.textContent = 'niente';
  } else if (mancano_contanti) {
    /* Sta PRIMA del caso «zero contanti» apposta: col buono in ballo, zero non
       vuol dire «non li ho contati», vuol dire che manca la differenza. */
    riquadro.classList.add('manca');
    $('#resto .resto-etichetta').textContent = 'Mancano';
    cifra.textContent = euro(in_contanti - dati);
  } else if (dati === 0) {
    cifra.textContent = '—';
    $('#resto .resto-etichetta').textContent = 'Resto';
  } else if (dati === in_contanti) {
    riquadro.classList.add('pari');
    $('#resto .resto-etichetta').textContent = 'Resto';
    cifra.textContent = 'niente';
  } else {
    /* Contanti battuti e poi coperti da un buono arrivato dopo: 'in_contanti' e'
       sceso a zero e qui viene fuori da solo che vanno restituiti tutti. Non
       serve un caso apposta, lo dice la formula. */
    riquadro.classList.add('da-dare');
    $('#resto .resto-etichetta').textContent = 'Resto';
    cifra.textContent = euro(dati - in_contanti);
  }

  // Non si incassa a vuoto, e non si incassa se i soldi sul banco non bastano.
  $('#incassa').disabled = (da_pagare === 0) || mancano_contanti;
  $('#annulla').disabled = (da_pagare === 0 && dati === 0 && stato.vendita.buono === 0);
}

/* La faccia del pulsante del buono: l'importo sopra, quello che resta sotto.

   Il numero sta attaccato alla cosa a cui appartiene, e soprattutto nel conto non
   compare nessuna riga nuova quando si conferma un buono. Se comparisse, i tasti
   dei tagli e «Incassa» si sposterebbero di un paio di centimetri sotto il dito
   di chi sta battendo - ed e' la cosa che questa app non fa mai, § «Il telefono e
   il computer» nella scheda dell'aspetto. */
function disegnaBuono() {
  var b = $('#taglio-buono');
  if (!b) { return; }

  var buono = stato.vendita.buono;
  var resta = restoDelBuono();

  b.textContent = '';
  b.classList.toggle('acceso', buono > 0);

  var sopra = document.createElement('span');
  sopra.textContent = buono > 0 ? 'Buono ' + euro(buono) : 'Buono';
  b.appendChild(sopra);

  if (resta > 0) {
    var sotto = document.createElement('span');
    sotto.className = 'taglio-resto';
    sotto.textContent = 'restano ' + euro(resta);
    b.appendChild(sotto);
  }

  b.setAttribute('aria-label', buono === 0
    ? 'Paga con un buono'
    : 'Buono da ' + euro(buono) +
      (resta > 0 ? ', ne restano ' + euro(resta) : '') + '. Tocca per cambiarlo.');
}

/* La faccia del pulsante del credito: la parola sopra, quanto finirebbe sul
   quaderno sotto. Il pulsante dice sempre cosa fa davvero, perche' tocca i soldi
   della scuola - e' la stessa regola di «Togli questa giornata».

   Quando non c'e' niente da segnare si SPEGNE, non sparisce, e al posto della
   cifra tiene un trattino: un pulsante che compare o cambia altezza sposta i due
   accanto sotto il dito di chi sta battendo, ed e' la cosa che questa app non fa
   mai. */
function disegnaCredito() {
  var b = $('#credito');
  if (!b) { return; }

  var quanto = creditoPossibile();
  b.textContent = '';
  b.disabled = quanto === 0;

  var sopra = document.createElement('span');
  sopra.textContent = 'Credito';
  b.appendChild(sopra);

  var sotto = document.createElement('span');
  sotto.className = 'btn-credito-cifra';
  sotto.textContent = quanto > 0 ? euro(quanto) : '—';
  b.appendChild(sotto);

  b.setAttribute('aria-label', quanto > 0
    ? 'Segna ' + euro(quanto) + ' a credito'
    : 'Credito: non c’è niente da segnare');
}

function disegnaGiornata() {
  allineaGiornata();

  var g = stato.giornata;
  var parti = g.data.split('-');
  $('#data-oggi').textContent = 'Oggi è il ' + parti[2] + '/' + parti[1] + '/' + parti[0] + '.';

  /* Quanto ha fatto QUESTO dispositivo oggi: la cassa aperta adesso piu' quello che
     ha gia' archiviato oggi, se la cassa era gia' stata chiusa una volta. */
  var mio = { vendite: g.vendite, incasso: g.incasso, buoni: g.buoni || 0,
              crediti: g.crediti || 0, voci: {} };
  sommaVoci(mio.voci, g.voci);
  /* Le mie righe di oggi gia' chiuse: quelle locali, o quella del server se qui non e'
     rimasto niente. La regola sta in mieGiornateArchiviate ed e' la stessa che usa lo
     Storico: due schermate che contano lo stesso giorno devono contarlo allo stesso modo,
     altrimenti danno due numeri diversi e non si sa quale credere. */
  mieGiornateArchiviate(g.data).forEach(function (x) {
    mio.vendite += x.vendite;
    mio.incasso += x.incasso;
    mio.buoni += quotaBuoni(x);
    mio.crediti += quotaCrediti(x);
    sommaVoci(mio.voci, x.voci);
  });

  // Quanto ha fatto il BAR oggi: il mio piu' quello degli altri dispositivi.
  var tutti = { vendite: mio.vendite, incasso: mio.incasso, buoni: mio.buoni,
                crediti: mio.crediti, voci: {} };
  sommaVoci(tutti.voci, mio.voci);

  var altri = giornateAltrui(g.data);
  altri.forEach(function (x) {
    tutti.vendite += x.vendite;
    tutti.incasso += x.incasso;
    tutti.buoni += quotaBuoni(x);
    tutti.crediti += quotaCrediti(x);
    sommaVoci(tutti.voci, x.voci);
  });

  $('#incasso-oggi').textContent = euro(tutti.incasso);
  $('#vendite-oggi').textContent = String(tutti.vendite);

  /* La riga piccola dice due cose, e ognuna compare solo quando serve davvero.

     La divisione fra contanti e buoni e' quella che permette di contare la
     scatola a fine giornata: il numero grande e' quanto si e' VENDUTO, e i buoni
     non sono soldi entrati. Senza questa riga, chi conta i contanti troverebbe
     meno di quello che l'app dichiara e non saprebbe perche'.

     Quanto ha fatto questo dispositivo compare solo se ce n'e' davvero un altro:
     se batte cassa un dispositivo solo, ripetere due volte lo stesso numero
     confonde e basta. */
  var note_oggi = [];
  var come_oggi = comeSiEPagato(tutti.incasso, tutti.buoni, tutti.crediti);
  if (come_oggi) { note_oggi.push(come_oggi); }
  if (altri.length > 0) {
    note_oggi.push('su questo dispositivo ' + euro(mio.incasso));
  }

  /* Due note su due righe e non in fila: con contanti, buoni E credito la riga in
     fila diventa un paragrafo, e su un telefono stretto due righe corte si leggono
     meglio di tre righe che vanno a capo dove capita. */
  var nota_oggi = $('#incasso-mio');
  nota_oggi.textContent = '';
  note_oggi.forEach(function (t) {
    var riga = document.createElement('span');
    riga.className = 'nota-riga';
    riga.textContent = t;
    nota_oggi.appendChild(riga);
  });

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

  // Una giornata fuori dai conti non si annuncia: non e' finita in nessun totale.
  var dentro = stato.mio.filter(function (x) { return !x.fuori; });
  var ultimo = dentro.length ? dentro[dentro.length - 1] : null;
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
    t.buoni += quotaBuoni(g);
    t.crediti += quotaCrediti(g);
    t.vendite += g.vendite;
    t.pezzi += pezziDelGiorno(g);
    return t;
  }, { incasso: 0, buoni: 0, crediti: 0, vendite: 0, pezzi: 0 });
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
  var come = comeSiEPagato(g.incasso, quotaBuoni(g), quotaCrediti(g));
  riga.textContent = g.vendite + (g.vendite === 1 ? ' vendita' : ' vendite') +
    ' · incasso ' + euro(g.incasso) + (come ? ' · ' + come : '');
  box.appendChild(riga);

  /* Sta PRIMA di «Togli questa giornata» apposta: la cosa innocua per prima, quella
     che tocca i conti per ultima. E non chiede nessun permesso - copiare fuori
     quello che si ha gia' davanti agli occhi non cambia niente per nessuno, quindi
     il pulsante c'e' anche per chi puo' solo guardare. */
  var word = document.createElement('button');
  word.type = 'button';
  word.className = 'btn btn-scarica btn-scarica-giorno';
  word.dataset.scaricaGiorno = g.data;
  word.textContent = 'Scarica questa giornata in Word';
  box.appendChild(word);

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
  /* «Si puo' rimettere» vale perche' il server non cancella: ci mette un segno. Ma
     non vale sempre, e promettere il contrario e' la cosa peggiore da scrivere sotto
     un pulsante che tocca i soldi della scuola. Tre casi, tre frasi diverse. */
  var poi;
  if (!window.Sincronia.configurato()) {
    poi = 'Non c’è nessun server: questa giornata sta soltanto su questo dispositivo, ' +
          'e togliendola sparisce per sempre.';
  } else if (g.da_inviare) {
    poi = 'Attenzione: questa giornata non è ancora arrivata al server. Togliendola qui ' +
          'sparisce e non si può più rimettere.';
  } else {
    poi = 'Sul server la giornata resta scritta e si può rimettere.';
  }

  if (!window.confirm('Tolgo dai conti la giornata di ' + dataLunga(data) + '?\n\n' +
      euro(g.incasso) + ' in ' + quante + ' escono dai totali dell\'anno, su tutti i ' +
      'dispositivi.\n\n' + poi)) { return; }

  /* Senza server non c'e' nessuno a cui chiederlo, e la giornata vive solo qui: si
     toglie e basta. Fino al 9 settembre 2026 il pulsante veniva costruito lo stesso -
     senza server «puoModificare» dice di si', ed e' giusto - ma poi chiedeva al
     server, che non c'e', e falliva ogni volta con un avviso incomprensibile. Il
     pulsante c'era e non funzionava mai. */
  if (!window.Sincronia.configurato()) {
    stato.mio = stato.mio.filter(function (x) { return x.data !== data; });
    salva();
    disegnaStorico();
    return;
  }

  /* Fuori dai conti, non via di qui. La riga resta perche' resta il totale di quel
     giorno su questo dispositivo: se poi si vende ancora nello stesso giorno - ed e' il
     caso piu' probabile, visto che si tolgono le prove del giorno stesso - la chiusura
     di cassa ci si somma dentro e al server arriva ancora un totale.

     Buttandola via si ricominciava da zero, e l'invio dopo cancellava sul server quello
     di prima: il 17 settembre 2026 sono spariti cosi' 23,50 €, e non li ha riportati
     indietro nemmeno rimettere dentro il giorno, perche' la riga era gia' sovrascritta. */
  window.Sincronia.annulla(data).then(function () {
    stato.mio.forEach(function (x) { if (x.data === data) { x.fuori = true; } });
    segnaUscitaDalConto(data);
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
  // Compare solo se in tutto l'anno qualcuno ha pagato con un buono o a credito.
  $('#incasso-anno-nota').textContent = comeSiEPagato(t.incasso, t.buoni, t.crediti);

  /* Il numero per cui il credito esiste: quanto e' uscito dal banco senza denaro
     da settembre a oggi. Dice «segnato a credito» e non «ancora da riscuotere»,
     che sarebbe una bugia - l'app non sa registrare i rimborsi, quindi non puo'
     sapere quanto di quello e' gia' rientrato. Chi ha pagato si vede sul quaderno.

     Qui il cartellino puo' comparire e sparire senza fare danno: lo Storico e' una
     pagina che scorre, non la cassa che si batte con la fila davanti. */
  $('#cartellino-credito').hidden = t.crediti === 0;
  $('#credito-anno').textContent = euro(t.crediti);
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

/* Un campo del foglio, scritto in modo che non possa rompere la riga.

   Due guai diversi, e tutti e due si vedono solo aprendo il file mesi dopo:
   il punto e virgola separa le colonne, quindi un prodotto chiamato «Acqua;
   naturale» spezzerebbe la riga in due e sposterebbe l'incasso sotto la colonna
   sbagliata; e un nome che comincia per = + - @ viene letto da Excel e LibreOffice
   come una FORMULA invece che come testo. Le virgolette raddoppiate sono il modo
   standard di dire «questo e' tutto un campo solo»; l'apice davanti disinnesca la
   formula e non si vede nella cella. */
function campo(testo) {
  var t = String(testo);
  if (t.length > 0 && '=+-@'.indexOf(t.charAt(0)) !== -1) { t = "'" + t; }

  var scomodo = t.indexOf('"') !== -1 || t.indexOf(';') !== -1 ||
                t.indexOf('\n') !== -1 || t.indexOf('\r') !== -1;

  return scomodo ? '"' + t.replace(/"/g, '""') + '"' : t;
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
  /* «Incasso» resta quanto si e' VENDUTO e resta dov'era: le colonne nuove si
     aggiungono in fondo, cosi' un file vecchio e uno nuovo restano confrontabili.
     «Contanti» e' quello che deve esserci nella scatola; «Buoni» e' la parte che
     nella scatola non e' mai entrata perche' nessuno l'ha pagata, «Crediti» quella
     che non e' entrata ancora. Senza questa divisione il foglio dichiarerebbe alla
     scuola soldi che la scuola non ha visto.

     «Contanti» cambia valore ma non significato: ha sempre voluto dire «quello che
     e' finito nella scatola», e una vendita a credito nella scatola non finisce.
     Nei file di prima i crediti sono zero, quindi le somme vecchie restano quelle. */
  r.push('Giorno;Data;Vendite;Pezzi;Incasso;Contanti;Buoni;Crediti');

  giorni.forEach(function (g) {
    var b = quotaBuoni(g);
    var c = quotaCrediti(g);
    r.push(campo(dataLunga(g.data, true)) + ';' + g.data + ';' + g.vendite + ';' +
           pezziDelGiorno(g) + ';' + virgola(g.incasso) + ';' +
           virgola(g.incasso - b - c) + ';' + virgola(b) + ';' + virgola(c));
  });

  r.push('TOTALE;;' + t.vendite + ';' + t.pezzi + ';' + virgola(t.incasso) + ';' +
         virgola(t.incasso - t.buoni - t.crediti) + ';' + virgola(t.buoni) + ';' +
         virgola(t.crediti));
  r.push('');
  r.push('Dettaglio per prodotto');
  r.push('Data;Prodotto;Pezzi;Incasso');

  giorni.forEach(function (g) {
    Object.keys(g.voci).forEach(function (k) {
      var v = g.voci[k];
      r.push(g.data + ';' + campo(v.nome) + ';' + v.qta + ';' + virgola(v.somma));
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

  window.Documento.scarica(blob, nome);
}

// --------------------------------------------------------------- la giornata in Word

/* Una giornata sola su un foglio, da stampare o da allegare a una mail.

   Non fa lo stesso mestiere del riepilogo dell'anno qui sopra, ed e' il motivo per
   cui sono due pulsanti diversi: quello e' un foglio di CALCOLO e serve a sommare
   duecento giorni; questo e' CARTA e serve a mostrarne uno solo a qualcuno. Nessuno
   dei due e' uno scontrino e nessuno dei due fa fede di niente.

   Il documento vero e proprio lo impagina documento.js. Qui si decide solo cosa ci
   va scritto, e i centesimi diventano euro con euro() come dappertutto. */
function scaricaGiornataWord(data) {
  var g = null;
  giornateDellAnno().forEach(function (x) { if (x.data === data) { g = x; } });
  if (!g) { return; }

  // Su un foglio la data e' un titolo e comincia in maiuscolo; nell'elenco no.
  var giorno = dataLunga(g.data, true);
  var pezzi = pezziDelGiorno(g);

  var blocchi = [
    { tipo: 'titolo', testo: 'Bar scolastico' },
    { tipo: 'sottotitolo',
      testo: 'Riepilogo della giornata · anno scolastico ' + annoCorrente() },
    { tipo: 'giorno', testo: giorno.charAt(0).toUpperCase() + giorno.slice(1) },
    { tipo: 'forte', testo: 'Incasso della giornata: ' + euro(g.incasso) }
  ];

  /* Su un foglio che gira fuori dall'app questa riga conta piu' che altrove: dice
     che il numero grande e' quanto si e' venduto, e che una parte non e' denaro
     entrato in cassa. Compare solo se quel giorno qualcuno ha pagato con un buono
     o e' andato via a credito. */
  var come_pagato = comeSiEPagato(g.incasso, quotaBuoni(g), quotaCrediti(g));
  if (come_pagato) {
    blocchi.push({ tipo: 'riga', testo: 'D' + come_pagato.slice(1) + '.' });
  }

  blocchi.push({ tipo: 'riga', testo: g.vendite + (g.vendite === 1 ? ' vendita' : ' vendite') +
    ' · ' + pezzi + (pezzi === 1 ? ' pezzo' : ' pezzi') });

  /* Le stesse due note che si vedono sulla riga dello Storico. Su un foglio che gira
     fuori dall'app contano di piu': dicono perche' quel numero potrebbe non essere
     l'ultima parola. */
  if (g.automatica) {
    blocchi.push({ tipo: 'tenue', testo: 'La cassa di questo giorno non è stata ' +
      'chiusa a mano: è stata archiviata da sola.' });
  }

  if (g.da_inviare && window.Sincronia.configurato()) {
    blocchi.push({ tipo: 'tenue', testo: 'Una parte di questa giornata non è ancora ' +
      'arrivata al server: su altri dispositivi i totali possono essere più bassi.' });
  }

  var voci = g.voci || {};
  var chiavi = Object.keys(voci).sort(function (a, b) { return voci[b].qta - voci[a].qta; });

  if (chiavi.length === 0) {
    blocchi.push({ tipo: 'riga',
      testo: 'Di questo giorno è rimasto solo il totale, non il dettaglio dei prodotti.' });
  } else {
    blocchi.push({
      tipo: 'tabella',
      intestazione: ['Prodotto', 'Pezzi', 'Incasso'],
      righe: chiavi.map(function (k) {
        return [voci[k].nome, String(voci[k].qta), euro(voci[k].somma)];
      }),
      totale: ['Totale', String(pezzi), euro(g.incasso)]
    });
  }

  blocchi.push({ tipo: 'tenue', testo: 'Il ricavato resta alla scuola. Questo foglio ' +
    'non è uno scontrino fiscale.' });
  blocchi.push({ tipo: 'tenue', testo: 'Scaricato il ' + dataLunga(oggi(), true) + '.' });

  /* Se qualcosa va storto lo si deve VEDERE. Un pulsante che non fa niente e non
     dice niente e' il difetto peggiore da inseguire mesi dopo: si finisce a cercare
     il file scaricato in tutte le cartelle del telefono. */
  try {
    window.Documento.scarica(window.Documento.word(blocchi),
      'bar-scolastico-' + g.data + '.docx');
  } catch (e) {
    window.alert('Il file Word non è stato creato: ' + (e.message || 'errore sconosciuto.'));
  }
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

    /* I quattro pulsanti stanno insieme dentro una scatola loro, e la scatola va a
       capo: e' quello che li tiene incolonnati riga dopo riga. Appesi al nome come
       prima, ognuno partiva da dove finiva il nome della SUA riga, e le ✕ uscivano
       tutte a quote diverse. Il come sta in stile.css, sotto «prodotti». */
    var azioni = document.createElement('div');
    azioni.className = 'voce-azioni';
    azioni.appendChild(su); azioni.appendChild(giu);
    azioni.appendChild(modifica); azioni.appendChild(elimina);

    li.appendChild(nome); li.appendChild(prezzo);
    li.appendChild(azioni);
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

/* Il gesto di penna che resta da fare dopo l'ultima vendita chiusa: scrivere
   l'avanzo sul buono di carta, oppure segnare il credito sul quaderno. Vive il
   tempo che passa fra il pulsante e il primo tocco della vendita dopo.

   E' uno solo perche' i due casi non capitano mai insieme: se un buono avanza, la
   spesa e' coperta e non c'e' niente da mettere a credito. */
var promemoria = '';

function aggiungiPezzo(id) {
  var p = prodottoCon(id);
  if (!p) { return; }
  promemoria = '';
  ultimo_toccato = id;
  var trovata = false;
  stato.vendita.righe.forEach(function (r) {
    if (r.id === id) { r.qta += 1; trovata = true; }
  });
  /* Il prezzo e il nome si scrivono QUI, una volta sola, e non si rileggono piu':
     e' il momento del tocco che fa fede, § il prezzo congelato. Un pezzo aggiunto
     a una riga che c'e' gia' tiene il prezzo della riga - il cliente ha sentito un
     prezzo solo per quel prodotto, e due prezzi nella stessa riga non si possono
     nemmeno scrivere. */
  if (!trovata) { stato.vendita.righe.push({ id: id, qta: 1, prezzo: p.prezzo, nome: p.nome }); }
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
    // Togliere un pezzo non ricontratta il prezzo: la riga resta quella di prima.
    return r.id === id ? { id: r.id, qta: r.qta - 1, prezzo: r.prezzo, nome: r.nome } : r;
  }).filter(function (r) { return r.qta > 0; });
  salva();
  disegnaTutto();
}

function svuotaVendita() {
  ultimo_toccato = null;
  promemoria = '';
  stato.vendita = { righe: [], contanti: 0, buono: 0 };
  salva();
  disegnaTutto();
}

/* Il blocco dei sei decimi di secondo vale per TUTTI E DUE i pulsanti che
   chiudono una vendita: due tocchi involontari non devono registrare due vendite,
   e non importa se cadono sullo stesso pulsante o uno per ciascuno. */
var incasso_in_corso = false;

/* Quello che «Incassa» e «Credito» scrivono nella giornata, e lo scrivono qui
   tutti e due. Duplicare questo blocco sarebbe il modo classico di farlo
   divergere: un giorno si corregge di qua e non di la', e i conti dell'anno non
   tornano piu'.

   'incasso' resta quanto si e' VENDUTO. 'col_buono' e 'a_credito' sono due PARTI
   di quello - la parte che nessuno ha pagato e quella che non e' ancora stata
   pagata - e i contanti, cioe' quello che davvero e' finito nella scatola, sono
   la differenza. E' l'unico modo perche' a fine giornata il denaro contato torni
   con quello che l'app dichiara. */
function registraVendita(da_pagare, col_buono, a_credito) {
  allineaGiornata();

  righeVive().forEach(function (r) {
    /* Nome e prezzo dalla RIGA, come nel totale: se si prendessero dal listino, il
       dettaglio dei prodotti direbbe una cifra e l'incasso un'altra, e la somma
       delle voci non tornerebbe piu' con l'incasso della giornata. La chiave resta
       l'id del prodotto, cosi' due vendite dello stesso prodotto si sommano nella
       stessa voce anche se nel frattempo il listino e' cambiato. */
    var nome_riga = nomeDiRiga(r);
    var voce = stato.giornata.voci[r.id] || { nome: nome_riga, qta: 0, somma: 0 };
    voce.nome = nome_riga;
    voce.qta += r.qta;
    voce.somma += prezzoDiRiga(r) * r.qta;
    stato.giornata.voci[r.id] = voce;
  });

  stato.giornata.vendite += 1;
  stato.giornata.incasso += da_pagare;
  stato.giornata.buoni += col_buono;
  stato.giornata.crediti += a_credito;
}

function incassa() {
  if (incasso_in_corso) { return; }
  var da_pagare = totale();
  if (da_pagare === 0) { return; }

  var in_contanti = daPagareInContanti();
  var dati = stato.vendita.contanti;

  /* La stessa condizione del pulsante, ripetuta qui perche' il pulsante e' un
     avviso e questo e' la serratura: chi arrivasse a chiamare 'incassa' per
     un'altra strada non deve poter registrare soldi che nessuno ha dato. */
  if ((dati > 0 || stato.vendita.buono > 0) && dati < in_contanti) { return; }

  /* Si leggono PRIMA di svuotare la vendita: dopo non c'e' piu' niente da leggere. */
  var col_buono = buonoUsato();
  var resta_sul_buono = restoDelBuono();

  incasso_in_corso = true;
  window.setTimeout(function () { incasso_in_corso = false; }, 600);

  registraVendita(da_pagare, col_buono, 0);
  svuotaVendita();

  if (resta_sul_buono > 0) {
    promemoria = 'Scrivi ' + euro(resta_sul_buono) + ' sul buono.';
    disegnaConto();
  }
}

/* «Credito»: la merce esce dal banco e il denaro no, o non tutto. La scuola resta
   creditrice, e il nome di chi deve si scrive sul quaderno di carta - nell'app
   non entra, § «Il credito» nella scheda della logica.

   Chiede conferma perche' e' l'unico pulsante della cassa che fa uscire roba dal
   banco senza contropartita, e la frase dice i numeri veri: quanto entra nella
   scatola e quanto no. Una conferma che non dice le cifre si impara a premere
   senza leggerla. */
function segnaCredito() {
  if (incasso_in_corso) { return; }
  var da_pagare = totale();
  if (da_pagare === 0) { return; }

  /* La serratura, come in 'incassa': se non manca niente non c'e' niente da
     segnare, e il credito non deve poter nascere da un'altra strada. */
  var a_credito = creditoPossibile();
  if (a_credito === 0) { return; }

  var col_buono = buonoUsato();
  var in_contanti = stato.vendita.contanti;

  var domanda = in_contanti > 0
    ? 'Prendo ' + euro(in_contanti) + ' in contanti e segno ' + euro(a_credito) +
      ' a credito?\n\nNella scatola entra solo ' + euro(in_contanti) + '.'
    : 'Segno ' + euro(a_credito) + ' a credito?\n\nNella scatola non entra niente.';

  if (!window.confirm(domanda + ' Scrivi nome e importo sul quaderno dei crediti.')) { return; }

  incasso_in_corso = true;
  window.setTimeout(function () { incasso_in_corso = false; }, 600);

  registraVendita(da_pagare, col_buono, a_credito);
  svuotaVendita();

  promemoria = 'Segna ' + euro(a_credito) + ' sul quaderno dei crediti.';
  disegnaConto();
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

  /* «Buono» e «Conta giusti» dividono l'ultima riga, due caselle per uno: coi
     nove tagli fanno dodici caselle esatte, cioe' tre righe piene su quattro
     colonne, senza buchi e senza un pixel d'altezza in piu'. Una riga tutta per
     «Buono» sarebbero 56 px di tasto piu' il divario, e quei pixel li pagherebbe
     la griglia dei prodotti, che vive dell'avanzo. */
  var buono = document.createElement('button');
  buono.type = 'button';
  buono.className = 'taglio buono';
  buono.id = 'taglio-buono';
  contenitore.appendChild(buono);

  var esatto = document.createElement('button');
  esatto.type = 'button';
  esatto.className = 'taglio esatto';
  esatto.id = 'taglio-esatto';
  esatto.textContent = 'Conta giusti';
  contenitore.appendChild(esatto);

  disegnaBuono();
}

/* --------------------------------------------------------------- il tastierino

   L'unica cosa che si digita in tutta l'app. Non e' un campo di testo: la
   tastiera del telefono coprirebbe meta' schermo - cioe' i prodotti e «Incassa» -
   e in dieci minuti d'intervallo quello e' un difetto, non un dettaglio. Tasti
   grandi come tutti gli altri, e le cifre che entrano da destra come su una cassa
   vera: 5 0 0 fa 5,00 €.

   Sul PC funziona anche la tastiera di sistema, perche' li' non copre niente. */
var cifre_battute = '';

function costruisciTastierino() {
  var contenitore = $('#tastierino-tasti');
  contenitore.textContent = '';

  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', 'cancella'].forEach(function (c) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'tasto' + (c === '0' ? ' zero' : '') + (c === 'cancella' ? ' cancella' : '');
    b.dataset.cifra = c;
    b.textContent = c === 'cancella' ? '⌫' : c;
    if (c === 'cancella') { b.setAttribute('aria-label', 'Cancella l’ultima cifra'); }
    contenitore.appendChild(b);
  });
}

function mostraCifreBattute() {
  $('#tastierino-cifra').textContent = euro(Number(cifre_battute || '0'));
}

/* Gli zeri in testa si buttano via appena battuti, cosi' «0 0 5» e «5» sono la
   stessa cosa. Una cifra che porterebbe sopra il tetto non entra e basta: il
   numero sullo schermo resta quello di prima invece di diventare assurdo. */
function battiCifra(c) {
  if (c === 'cancella') {
    cifre_battute = cifre_battute.slice(0, -1);
    mostraCifreBattute();
    return;
  }

  var prova = (cifre_battute + c).replace(/^0+/, '');
  if (Number(prova || '0') > MASSIMO_BUONO) { return; }

  cifre_battute = prova;
  mostraCifreBattute();
}

function apriTastierino() {
  sfondoInerte(true);
  cifre_battute = '';
  mostraCifreBattute();
  // «Togli il buono» c'e' solo se c'e' qualcosa da togliere.
  $('#tastierino-togli').hidden = stato.vendita.buono === 0;
  $('#tastierino').hidden = false;
  window.setTimeout(function () { $('#tastierino-ok').focus(); }, 60);
}

function chiudiTastierino() {
  $('#tastierino').hidden = true;
  cifre_battute = '';
  sfondoInerte(false);
}

function scegliBuono(centesimi) {
  stato.vendita.buono = centesimi;
  promemoria = '';
  chiudiTastierino();
  salva();
  disegnaConto();
}

function collegaEventi() {
  /* Due schede dello stesso telefono aperte sulla cassa. Succede: si tocca l'icona
     dalla schermata, e intanto la pagina era gia' aperta nel browser.

     Senza questo, le due schede tengono in pancia due copie dello stesso stato e
     l'ultima che salva vince: una chiude la cassa e archivia la giornata, l'altra -
     che quella giornata non l'ha mai vista - al tocco dopo riscrive la memoria con
     la sua copia vecchia e la RIPORTA IN VITA, aperta, coi soldi gia' mandati al
     server dentro. La chiusura successiva li rimanda, e il totale del giorno e'
     quello sbagliato.

     Il browser fa scattare 'storage' soltanto nelle ALTRE schede, mai in quella che
     ha scritto: quindi qui non si torna mai a giro per una scrittura nostra. Per
     stare tranquilli lo stesso, questo gestore non salva niente - rilegge e
     ridisegna, e basta. Se salvasse, due schede si rimbalzerebbero salvataggi a
     vicenda finche' una delle due non si chiude.

     Il prezzo: la scheda che aveva un carrello aperto se lo vede cambiare sotto,
     perche' il carrello sta nella stessa memoria ed e' uno solo per tutto il
     telefono. E' il meno peggio: tenerselo vorrebbe dire risalvarlo dopo, cioe'
     riportare in vita una vendita che nell'altra scheda era gia' stata incassata. */
  window.addEventListener('storage', function (e) {
    if (e && e.key && e.key !== CHIAVE) { return; }
    stato = carica();
    ridisegnaQuelloCheSiVede();
  });

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
    if (b.id === 'taglio-buono') {
      apriTastierino();
      return;
    }
    if (b.id === 'taglio-esatto') {
      /* «Conta giusti» vuol dire «mi ha dato esatto quello che deve»: quello che
         deve e' la parte che il buono non copre, non il totale della spesa. */
      stato.vendita.contanti = daPagareInContanti();
    } else {
      stato.vendita.contanti += parseInt(b.dataset.taglio, 10);
    }
    salva();
    disegnaConto();
  });

  /* Azzera i CONTANTI, come dice il suo nome, e non tocca il buono. Se li
     azzerasse tutti e due, un cassiere che corregge un taglio battuto per sbaglio
     si porterebbe via anche il buono senza accorgersene, e allo studente
     verrebbe chiesto tutto in contanti. Il buono si toglie dal suo tastierino,
     dietro un tocco deliberato. */
  $('#azzera-contanti').addEventListener('click', function () {
    stato.vendita.contanti = 0;
    salva();
    disegnaConto();
  });

  // --------------------------------------------------------- il tastierino

  $('#tastierino-tasti').addEventListener('click', function (e) {
    var b = e.target.closest('[data-cifra]');
    if (b) { battiCifra(b.dataset.cifra); }
  });

  $('#tastierino-ok').addEventListener('click', function () {
    scegliBuono(Number(cifre_battute || '0'));
  });

  $('#tastierino-togli').addEventListener('click', function () { scegliBuono(0); });
  $('#tastierino-lascia').addEventListener('click', chiudiTastierino);

  /* Sul PC la tastiera vera non copre niente, quindi tanto vale che funzioni.
     Invio e' gestito qui e non lasciato al pulsante che ha il fuoco: se il fuoco
     fosse rimasto su una cifra, Invio ribatterebbe quella cifra invece di
     confermare. */
  document.addEventListener('keydown', function (e) {
    if ($('#tastierino').hidden) { return; }

    if (e.key >= '0' && e.key <= '9') { e.preventDefault(); battiCifra(e.key); return; }
    if (e.key === 'Backspace') { e.preventDefault(); battiCifra('cancella'); return; }
    if (e.key === 'Enter') { e.preventDefault(); scegliBuono(Number(cifre_battute || '0')); return; }
    if (e.key === 'Escape') { e.preventDefault(); chiudiTastierino(); }
  });

  /* La conferma guarda anche il buono: prima guardava solo i pezzi, e un buono
     appena battuto sarebbe sparito in silenzio - cioe' allo studente sarebbe
     stato chiesto tutto in contanti senza che nessuno se ne accorgesse. */
  $('#annulla').addEventListener('click', function () {
    if (pezziNellaVendita() > 0 || stato.vendita.buono > 0) {
      if (!window.confirm('Butto via questa vendita e ricomincio?')) { return; }
    }
    svuotaVendita();
  });

  $('#incassa').addEventListener('click', incassa);
  $('#credito').addEventListener('click', segnaCredito);

  /* Chiudere la cassa vuol dire mettere via l'incasso di una giornata: chiede la
     password, cosi' non succede per un tocco sbagliato mentre c'e' la fila. La
     password la sanno tutti quelli che usano l'app - il suo mestiere qui e' fermare
     la mano, non riconoscere chi la muove. */
  $('#chiudi-cassa').addEventListener('click', function () {
    if (stato.giornata.vendite === 0) { return; }

    /* Quanto di oggi nella scatola non c'e' va detto QUI: e' il momento in cui il
       denaro si conta, e la differenza fra quello che l'app dichiara e quello che
       si trova ha un nome solo se la si legge prima di contare, non dopo. */
    var come_oggi = comeSiEPagato(stato.giornata.incasso, stato.giornata.buoni,
                                  stato.giornata.crediti);

    chiediPassword({
      titolo: 'Chiudi la cassa',
      invito: 'Incasso di oggi su questo dispositivo: ' + euro(stato.giornata.incasso) +
        (come_oggi ? ', ' + come_oggi : '') +
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
    var word = e.target.closest('[data-scarica-giorno]');
    if (word) { scaricaGiornataWord(word.dataset.scaricaGiorno); return; }

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
      /* Si toglie dal LISTINO, non dal conto in corso. Fino al 17 settembre 2026 qui
         spariva anche la riga della vendita aperta, e col cliente che aveva le
         pizzette in mano se ne andavano 6,00 € dal conto. Adesso la riga si porta
         dietro prezzo e nome, § il prezzo congelato, quindi ha tutto quello che le
         serve per restare: la merce e' gia' sul banco e si incassa lo stesso. Il
         prodotto tolto semplicemente non si puo' piu' battere dalla vendita dopo. */
      stato.prodotti = stato.prodotti.filter(function (x) { return x.id !== p.id; });
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

  /* Stessa scatola della riga normale, per due motivi: la riga non deve saltare da
     una disposizione all'altra quando si tocca ✎, e su un telefono stretto la
     casella del nome non deve ridursi a un francobollo per far posto ai pulsanti. */
  var azioni = document.createElement('div');
  azioni.className = 'voce-azioni';
  azioni.appendChild(salvaBtn); azioni.appendChild(annullaBtn);

  li.appendChild(nome); li.appendChild(prezzo);
  li.appendChild(azioni);
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

  /* Dentro la testata, sopra le schede. Fino al 9 settembre 2026 stava incollata in
     fondo allo schermo: su un telefono basso copriva per intero «Annulla» e
     «Incassa», cioe' i due pulsanti che chiudono la vendita che si ha per le mani, e
     l'unico modo per liberarli era ricaricare - che poi richiede la password, con la
     fila davanti. Un avviso non si mette mai davanti al lavoro. */
  var testata = document.querySelector('.testata');
  testata.insertBefore(striscia, testata.querySelector('.schede'));
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

  // Prima di rimandare qualcosa: le mie giornate che la' non ci sono piu' escono dai
  // conti anche di qui, se no restano per sempre a gonfiare i totali di questo
  // dispositivo. E quelle che la' sono tornate rientrano.
  allineaGiornateTolte();

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
  costruisciTastierino();
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
