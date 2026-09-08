/* Cassa del bar scolastico — tutta la logica.

   Regola numero uno: i soldi si contano in CENTESIMI INTERI, mai con la virgola.
   In JavaScript 0.1 + 0.2 non fa 0.3, e un resto sbagliato di un centesimo al banco
   e' un litigio. Si divide per 100 solo nell'ultimo istante, per scriverlo a schermo.  */

'use strict';

// --------------------------------------------------------------- memoria

var CHIAVE = 'cassa-bar-scolastico.v1';

// I tagli che il cliente puo' allungare. In centesimi.
var TAGLI = [50, 100, 200, 500, 1000, 2000];

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
    storico: []            // le giornate chiuse, dalla piu' vecchia alla piu' recente
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

  if (Array.isArray(letto.storico)) {
    s.storico = letto.storico.filter(function (g) {
      return g && typeof g.data === 'string' && Number.isFinite(g.incasso);
    }).map(function (g) {
      return {
        data: g.data,
        vendite: Number.isFinite(g.vendite) ? g.vendite : 0,
        incasso: g.incasso,
        voci: (g.voci && typeof g.voci === 'object') ? g.voci : {},
        automatica: !!g.automatica
      };
    });
  }

  /* Formato vecchio: la giornata non chiusa stava da sola in 'precedente' e si perdeva
     al giorno dopo. Adesso c'e' lo storico, quindi la si recupera li' dentro. */
  if (letto.precedente && typeof letto.precedente === 'object' &&
      typeof letto.precedente.data === 'string' && letto.precedente.incasso > 0) {
    var gia = s.storico.some(function (g) { return g.data === letto.precedente.data; });
    if (!gia) {
      s.storico.push({
        data: letto.precedente.data,
        vendite: Number.isFinite(letto.precedente.vendite) ? letto.precedente.vendite : 0,
        incasso: letto.precedente.incasso,
        voci: {},
        automatica: true
      });
    }
  }

  s.storico.sort(function (a, b) { return a.data < b.data ? -1 : (a.data > b.data ? 1 : 0); });

  return s;
}

function salva() {
  try { window.localStorage.setItem(CHIAVE, JSON.stringify(stato)); } catch (e) { /* niente da fare */ }
}

/* Mette una giornata nello storico. Se quel giorno c'e' gia' (cassa chiusa due volte
   nello stesso giorno) i conti si sommano invece di creare un doppione. */
function archivia(giornata, automatica) {
  if (!giornata || (giornata.vendite === 0 && giornata.incasso === 0)) { return; }

  var esistente = null;
  stato.storico.forEach(function (g) { if (g.data === giornata.data) { esistente = g; } });

  if (esistente) {
    esistente.vendite += giornata.vendite;
    esistente.incasso += giornata.incasso;
    Object.keys(giornata.voci).forEach(function (k) {
      var v = giornata.voci[k];
      var d = esistente.voci[k] || { nome: v.nome, qta: 0, somma: 0 };
      d.nome = v.nome;
      d.qta += v.qta;
      d.somma += v.somma;
      esistente.voci[k] = d;
    });
    if (!automatica) { esistente.automatica = false; }
    return;
  }

  stato.storico.push({
    data: giornata.data,
    vendite: giornata.vendite,
    incasso: giornata.incasso,
    voci: giornata.voci,
    automatica: !!automatica
  });
  stato.storico.sort(function (a, b) { return a.data < b.data ? -1 : (a.data > b.data ? 1 : 0); });
}

/* Se l'app si riapre in un giorno diverso, i totali di ieri non devono sommarsi a quelli
   di oggi. Non si buttano: finiscono nello storico segnati come «non chiusa a mano»,
   cosi' un incasso dimenticato resta comunque contato nell'anno. */
function allineaGiornata() {
  if (stato.giornata.data === oggi()) { return; }
  archivia(stato.giornata, true);
  stato.giornata = giornataVuota();
  salva();
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

  $('#incasso-oggi').textContent = euro(g.incasso);
  $('#vendite-oggi').textContent = String(g.vendite);

  var chiavi = Object.keys(g.voci);
  var pezzi_totali = riempiTabella($('#tabella-pezzi').querySelector('tbody'), g.voci);

  $('#pezzi-oggi').textContent = String(pezzi_totali);
  $('#tabella-pezzi').hidden = chiavi.length === 0;
  $('#giornata-vuota').hidden = chiavi.length > 0;
  $('#chiudi-cassa').disabled = g.vendite === 0;

  /* Se una giornata e' finita nello storico senza che la cassa fosse chiusa a mano,
     qui lo si dice. Sparisce da solo appena si registra la prima vendita di oggi. */
  var vecchio = document.getElementById('avviso-precedente');
  if (vecchio) { vecchio.remove(); }

  var ultimo = stato.storico.length ? stato.storico[stato.storico.length - 1] : null;
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

function totaliAnno() {
  return stato.storico.reduce(function (t, g) {
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

  var pezzi = document.createElement('span');
  pezzi.className = 'giorno-pezzi';
  pezzi.textContent = pezziDelGiorno(g) + ' pezzi';

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

  return box;
}

function disegnaStorico() {
  var elenco = $('#elenco-giorni');
  elenco.textContent = '';

  var giorni = stato.storico;
  var t = totaliAnno();
  var riferimento = giorni.length ? giorni[0].data : oggi();

  $('#titolo-anno').textContent = 'Anno scolastico ' + annoScolastico(riferimento);
  $('#incasso-anno').textContent = euro(t.incasso);
  $('#giorni-anno').textContent = String(giorni.length);
  $('#vendite-anno').textContent = String(t.vendite);

  $('#storico-vuoto').hidden = giorni.length > 0;
  $('#scarica-anno').disabled = giorni.length === 0;
  $('#chiudi-anno').disabled = giorni.length === 0;

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
    stato.storico.forEach(function (x) { if (x.data === li.dataset.data) { g = x; } });
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
  var giorni = stato.storico;
  var t = totaliAnno();
  var anno = annoScolastico(giorni.length ? giorni[0].data : oggi());
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
  var giorni = stato.storico;
  if (giorni.length === 0) { return; }

  var anno = annoScolastico(giorni[0].data).replace('/', '-');
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

  if (stato.prodotti.length === 0) {
    var vuoto = document.createElement('li');
    vuoto.className = 'nota-vuota';
    vuoto.textContent = 'Nessun prodotto: aggiungine uno qui sotto.';
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

function aggiungiPezzo(id) {
  if (!prodottoCon(id)) { return; }
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
  stato.vendita.righe = stato.vendita.righe.map(function (r) {
    return r.id === id ? { id: r.id, qta: r.qta - 1 } : r;
  }).filter(function (r) { return r.qta > 0; });
  salva();
  disegnaTutto();
}

function svuotaVendita() {
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

var prodotti_gia_sbloccati = false;

function vaiA(nome) {
  if (nome === 'prodotti' && !prodotti_gia_sbloccati) {
    var ok = window.confirm('Stai per cambiare i prodotti e i prezzi della cassa. Vuoi continuare?');
    if (!ok) { return; }
    prodotti_gia_sbloccati = true;
  }

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

  $('#chiudi-cassa').addEventListener('click', function () {
    var quanto = euro(stato.giornata.incasso);
    if (!window.confirm('Chiudo la cassa di oggi?\n\nIncasso: ' + quanto +
        '\n\nLa giornata finisce nello Storico e i totali tornano a zero per domani.')) { return; }

    archivia(stato.giornata, false);
    stato.giornata = giornataVuota();
    salva();
    disegnaGiornata();
    vaiA('storico');       // subito il riepilogo di quello che si e' appena chiuso
  });

  $('#elenco-giorni').addEventListener('click', function (e) {
    var testa = e.target.closest('.giorno-testa');
    if (testa) { apriChiudiGiorno(testa.parentNode); }
  });

  $('#scarica-anno').addEventListener('click', scaricaRiepilogo);

  /* Azzerare l'anno cancella l'unica traccia dei soldi della scuola: due conferme, e la
     seconda dice per esteso che cosa sparisce. */
  $('#chiudi-anno').addEventListener('click', function () {
    var t = totaliAnno();
    var n = stato.storico.length;
    if (n === 0) { return; }

    var anno = annoScolastico(stato.storico[0].data);

    if (!window.confirm('Comincio un anno nuovo?\n\nAnno ' + anno + ': ' + n +
        ' giorni, ' + euro(t.incasso) + ' incassati.\n\n' +
        'Hai scaricato il riepilogo? Dopo non si recupera.')) { return; }

    if (!window.confirm('Ultima conferma.\n\nSto per cancellare tutti i ' + n +
        ' giorni dell\'anno ' + anno + '. I prodotti e i prezzi restano.')) { return; }

    stato.storico = [];
    salva();
    disegnaStorico();
  });

  $('#elenco-prodotti').addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (!b) { return; }

    if (b.dataset.elimina) {
      var p = prodottoCon(b.dataset.elimina);
      if (!p) { return; }
      if (!window.confirm('Elimino «' + p.nome + '» dalla cassa?')) { return; }
      stato.prodotti = stato.prodotti.filter(function (x) { return x.id !== p.id; });
      stato.vendita.righe = stato.vendita.righe.filter(function (r) { return r.id !== p.id; });
      salva(); disegnaProdotti();
      return;
    }

    if (b.dataset.su || b.dataset.giu) {
      var id = b.dataset.su || b.dataset.giu;
      var passo = b.dataset.su ? -1 : 1;
      var i = stato.prodotti.findIndex(function (x) { return x.id === id; });
      var j = i + passo;
      if (i < 0 || j < 0 || j >= stato.prodotti.length) { return; }
      var appoggio = stato.prodotti[i];
      stato.prodotti[i] = stato.prodotti[j];
      stato.prodotti[j] = appoggio;
      salva(); disegnaProdotti();
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
    stato.prodotti.push({ id: nuovoId(), nome: nome, prezzo: prezzo });
    salva();
    $('#nuovo-nome').value = '';
    $('#nuovo-prezzo').value = '';
    $('#nuovo-nome').focus();
    disegnaProdotti();
  });
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
    p.nome = n;
    p.prezzo = c;
    salva();
    disegnaProdotti();
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

function avvia() {
  stato = carica();
  allineaGiornata();
  costruisciTagli();
  collegaEventi();
  disegnaTutto();
  collegaServiceWorker();

  // L'app puo' restare aperta per giorni: al rientro si ricontrolla la data e,
  // se serve, si riprende lo schermo acceso.
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState !== 'visible') { return; }
    allineaGiornata();
    if (!document.getElementById('schermata-giornata').hidden) { disegnaGiornata(); }
    tieniAccesoLoSchermo();
  });
}

avvia();
