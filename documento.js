/* Il file Word: come si costruisce un .docx a mano, senza librerie.

   Serve a una cosa sola: portare fuori dall'app un foglio che si stampa, si legge e
   si firma. I NUMERI per la scuola escono da un'altra parte - il riepilogo dell'anno
   in fondo allo Storico, che e' un foglio di calcolo e si somma. Questo no: questo
   e' carta.

   PERCHE' TUTTO QUESTO CODICE. Un .docx non e' un file di testo: e' una cartella
   compressa - uno zip - con dentro tre file scritti in XML. Di solito lo costruisce
   una libreria; qui non se ne usa nessuna, per la ragione scritta nella scheda del
   progetto, e allora lo zip lo scriviamo noi. E' meno spaventoso di come suona: lo
   zip permette di NON comprimere niente, e senza compressione basta incollare i file
   uno dietro l'altro con la loro carta d'identita' davanti, piu' un indice in fondo.
   L'unico conto vero e' il CRC32, il numero con cui lo zip si accorge se un file
   dentro si e' rovinato.

   QUI DENTRO NON SI CONTANO SOLDI. I centesimi diventano euro in un posto solo, in
   cassa.js: questo file riceve righe gia' scritte in parole e le impagina. Se ti
   trovi a scrivere una virgola decimale qui, hai sbagliato file.

   Tutto sta chiuso dentro una funzione anonima perche' i nomi di servizio qui sono
   generici - «tabella», «paragrafo», «riga» - e in un file caricato con <script>
   finirebbero mescolati a quelli di cassa.js, che ne ha di uguali. Esce solo
   window.Documento.  */

'use strict';

(function () {

// --------------------------------------------------------------- byte

/* Uno zip si scrive in byte, non in caratteri. Questi due aiutanti mettono in coda a
   un elenco di byte un numero piccolo (2 byte) o grande (4 byte), sempre col pezzo
   meno importante davanti: e' l'ordine che lo zip pretende, ed e' il contrario di
   come lo scriveremmo noi. */
function n16(coda, v) {
  coda.push(v & 0xFF, (v >>> 8) & 0xFF);
}

function n32(coda, v) {
  coda.push(v & 0xFF, (v >>> 8) & 0xFF, (v >>> 16) & 0xFF, (v >>> 24) & 0xFF);
}

function inByte(testo) {
  return new TextEncoder().encode(testo);
}

/* La firma di controllo di ogni file dentro lo zip. La tabella si costruisce una
   volta sola al primo file e poi resta li': rifarla a ogni giornata sarebbero
   duecentocinquantasei giri di conti per niente. */
var CRC = null;

function tabellaCrc() {
  if (CRC) { return CRC; }

  CRC = new Uint32Array(256);
  for (var i = 0; i < 256; i++) {
    var c = i;
    for (var k = 0; k < 8; k++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    CRC[i] = c >>> 0;
  }

  return CRC;
}

function crc32(byte) {
  var t = tabellaCrc();
  var c = 0xFFFFFFFF;
  for (var i = 0; i < byte.length; i++) {
    c = t[(c ^ byte[i]) & 0xFF] ^ (c >>> 8);
  }
  return (c ^ 0xFFFFFFFF) >>> 0;
}

/* Lo zip e' del 1989 e la data se la segna schiacciata in due numeri da due byte,
   coi secondi divisi per due e gli anni contati dal 1980. Non serve a niente qui
   dentro, ma se manca certi programmi si lamentano: si mette quella di adesso e non
   ci si pensa piu'. */
function oraDos(d) {
  var anno = Math.max(1980, d.getFullYear());
  return {
    ora: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
    data: ((anno - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()
  };
}

/* Lo zip vero e proprio. Riceve un elenco di {nome, testo} e restituisce i byte del
   file finito. Tre pezzi, in quest'ordine: i file uno dietro l'altro, l'indice che
   dice dove comincia ognuno, e la riga finale che dice quanto e' lungo l'indice.
   Niente compressione: il metodo dichiarato e' 0, e le due misure - quanto occupa
   compresso e quanto da scompattato - sono percio' lo stesso numero. */
function zip(parti) {
  var dati = [];
  var indice = [];
  var quando = oraDos(new Date());

  parti.forEach(function (p) {
    var nome = inByte(p.nome);
    var corpo = inByte(p.testo);
    var firma = crc32(corpo);
    var dove = dati.length;
    var i;

    n32(dati, 0x04034b50);                        // «qui comincia un file»
    n16(dati, 20); n16(dati, 0); n16(dati, 0);    // l'ultimo zero: nessuna compressione
    n16(dati, quando.ora); n16(dati, quando.data);
    n32(dati, firma); n32(dati, corpo.length); n32(dati, corpo.length);
    n16(dati, nome.length); n16(dati, 0);
    for (i = 0; i < nome.length; i++) { dati.push(nome[i]); }
    for (i = 0; i < corpo.length; i++) { dati.push(corpo[i]); }

    n32(indice, 0x02014b50);                      // «questa e' una voce dell'indice»
    n16(indice, 20); n16(indice, 20); n16(indice, 0); n16(indice, 0);
    n16(indice, quando.ora); n16(indice, quando.data);
    n32(indice, firma); n32(indice, corpo.length); n32(indice, corpo.length);
    n16(indice, nome.length); n16(indice, 0); n16(indice, 0);
    n16(indice, 0); n16(indice, 0); n32(indice, 0);
    n32(indice, dove);                            // da che byte comincia, qui sopra
    for (i = 0; i < nome.length; i++) { indice.push(nome[i]); }
  });

  var coda = [];
  n32(coda, 0x06054b50);                          // «finito»
  n16(coda, 0); n16(coda, 0);
  n16(coda, parti.length); n16(coda, parti.length);
  n32(coda, indice.length); n32(coda, dati.length);
  n16(coda, 0);

  return new Uint8Array(dati.concat(indice, coda));
}

// --------------------------------------------------------------- il documento

/* Un carattere fuori posto qui dentro e Word dice «il file e' danneggiato» senza
   spiegare altro: il nome di un prodotto con una & o una virgoletta romperebbe
   l'intero documento. Sono quattro sostituzioni e vanno fatte su OGNI testo che
   arriva da fuori. */
function xml(testo) {
  return String(testo)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

var NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';

/* La larghezza utile di un A4 coi margini qui sotto, in ventesimi di punto: e'
   l'unita' di misura di Word, e 1134 sono due centimetri. */
var LARGHEZZA = 9638;

/* Come si vedono i sei tipi di riga. La misura e' in MEZZI punti - 22 vuol dire 11
   punti - e il verde e' lo stesso dell'app. */
var STILI = {
  titolo:      { grassetto: true, misura: 36, colore: '0F766E', dopo: 40 },
  sottotitolo: { misura: 20, colore: '666666', dopo: 240 },
  giorno:      { grassetto: true, misura: 28, dopo: 40 },
  forte:       { grassetto: true, misura: 26, dopo: 60 },
  riga:        { misura: 22, dopo: 120 },
  tenue:       { misura: 18, colore: '666666', dopo: 60 }
};

/* Un pezzo di testo col suo aspetto. L'ordine dei pezzetti dentro <w:rPr> non e'
   libero: carattere, grassetto, colore, misura. Word perdona, LibreOffice a volte
   no, e un file che si apre solo su uno dei due non serve a niente. */
function pezzo(testo, m) {
  var r = '<w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/>';
  if (m.grassetto) { r += '<w:b/>'; }
  if (m.colore) { r += '<w:color w:val="' + m.colore + '"/>'; }
  r += '<w:sz w:val="' + (m.misura || 22) + '"/></w:rPr>';

  // «preserve» tiene gli spazi in testa e in fondo: senza, si perdono e basta.
  return '<w:r>' + r + '<w:t xml:space="preserve">' + xml(testo) + '</w:t></w:r>';
}

function paragrafo(testo, m) {
  var p = '<w:pPr><w:spacing w:after="' + (m.dopo === undefined ? 120 : m.dopo) + '"/>';
  if (m.destra) { p += '<w:jc w:val="right"/>'; }
  p += '</w:pPr>';
  return '<w:p>' + p + pezzo(testo, m) + '</w:p>';
}

/* La prima colonna e' il nome del prodotto e si prende lo spazio che avanza; le
   altre sono numeri e stanno strette. */
function larghezze(quante) {
  var stretta = 1900;
  var colonne = [LARGHEZZA - stretta * (quante - 1)];
  for (var i = 1; i < quante; i++) { colonne.push(stretta); }
  return colonne;
}

/* Una riga della tabella. La prima colonna e' testo e sta a sinistra, tutte le altre
   sono cifre e vanno a destra: incolonnate, si confrontano a occhio. */
function rigaTabella(celle, colonne, m) {
  var out = '<w:tr>';

  celle.forEach(function (testo, i) {
    var c = '<w:tcPr><w:tcW w:w="' + colonne[i] + '" w:type="dxa"/>';
    if (m.sfondo) { c += '<w:shd w:val="clear" w:color="auto" w:fill="' + m.sfondo + '"/>'; }
    c += '</w:tcPr>';

    out += '<w:tc>' + c + paragrafo(testo, {
      grassetto: m.grassetto, misura: 22, dopo: 0, destra: i > 0
    }) + '</w:tc>';
  });

  return out + '</w:tr>';
}

function tabella(b) {
  var colonne = larghezze(b.intestazione.length);
  var lati = ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'];

  var bordi = lati.map(function (l) {
    return '<w:' + l + ' w:val="single" w:sz="4" w:space="0" w:color="CCCCCC"/>';
  }).join('');

  var griglia = colonne.map(function (c) {
    return '<w:gridCol w:w="' + c + '"/>';
  }).join('');

  var t = '<w:tbl><w:tblPr><w:tblW w:w="' + LARGHEZZA + '" w:type="dxa"/>' +
    '<w:tblLayout w:type="fixed"/><w:tblBorders>' + bordi + '</w:tblBorders>' +
    '</w:tblPr><w:tblGrid>' + griglia + '</w:tblGrid>';

  t += rigaTabella(b.intestazione, colonne, { grassetto: true, sfondo: 'EEEEEE' });
  b.righe.forEach(function (r) { t += rigaTabella(r, colonne, {}); });
  if (b.totale) { t += rigaTabella(b.totale, colonne, { grassetto: true, sfondo: 'F5F5F5' }); }

  /* Il paragrafo vuoto dopo la tabella non e' un abbellimento: Word vuole che dopo
     una tabella ci sia sempre qualcos'altro, e senza questo un documento che finisce
     con una tabella non si apre. */
  return t + '</w:tbl><w:p><w:pPr><w:spacing w:after="0"/></w:pPr></w:p>';
}

function corpoDocumento(blocchi) {
  var corpo = '';

  blocchi.forEach(function (b) {
    if (b.tipo === 'tabella') { corpo += tabella(b); return; }
    corpo += paragrafo(b.testo, STILI[b.tipo] || STILI.riga);
  });

  // Foglio A4 in verticale, due centimetri di margine per lato.
  corpo += '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/>' +
    '<w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134"/></w:sectPr>';

  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:document ' + NS + '><w:body>' + corpo + '</w:body></w:document>';
}

/* Gli altri due file dentro il .docx. Non cambiano mai: il primo dice che tipo di
   roba c'e' dentro la cartella compressa, il secondo dice qual e' il documento
   principale. Sono il minimo indispensabile perche' Word lo riconosca. */
var TIPI =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
  '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
  '<Default Extension="xml" ContentType="application/xml"/>' +
  '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
  '</Types>';

var RELAZIONI =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  '<Relationship Id="rId1" Target="word/document.xml" ' +
  'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument"/>' +
  '</Relationships>';

var TIPO_WORD =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

// --------------------------------------------------------------- quello che esce

window.Documento = {

  /* Da un elenco di blocchi al file Word finito. I blocchi sono {tipo, testo}, coi
     tipi elencati in STILI, oppure {tipo: 'tabella', intestazione, righe, totale}.
     L'ordine dell'elenco e' l'ordine sul foglio, e non c'e' nient'altro da sapere. */
  word: function (blocchi) {
    return new Blob([zip([
      { nome: '[Content_Types].xml', testo: TIPI },
      { nome: '_rels/.rels', testo: RELAZIONI },
      { nome: 'word/document.xml', testo: corpoDocumento(blocchi) }
    ])], { type: TIPO_WORD });
  },

  /* Il modo di far scendere un file dal browser: si finge un collegamento, gli si
     dice come deve chiamarsi il file, lo si preme da soli e lo si butta via. Lo
     spazio in memoria si libera dopo, non subito: chiuderlo troppo presto e' il modo
     classico di ritrovarsi un file da zero byte. */
  scarica: function (blob, nome) {
    var indirizzo = URL.createObjectURL(blob);

    var a = document.createElement('a');
    a.href = indirizzo;
    a.download = nome;
    document.body.appendChild(a);
    a.click();
    a.remove();

    window.setTimeout(function () { URL.revokeObjectURL(indirizzo); }, 2000);
  }
};

}());
