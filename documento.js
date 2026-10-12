/* Il file Word e il file Excel: come si costruiscono un .docx e un .xlsx a mano,
   senza librerie.

   Il Word porta fuori dall'app una giornata sola, su un foglio che si stampa, si
   legge e si firma: e' carta. I NUMERI per la scuola escono invece dal file Excel -
   il riepilogo dell'anno in fondo allo Storico, che e' un foglio di calcolo e si
   somma. Tutti e due sono uno zip con dentro dei file XML, e lo zip e' uno solo, qui
   sotto. Il foglio Excel sta in fondo, § il foglio Excel.

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
   arriva da fuori.

   Ma le quattro sostituzioni non bastano, e non e' una pignoleria: ci sono
   caratteri che l'XML 1.0 non ammette PROPRIO - nemmeno scritti per esteso come
   &#0; - e un solo carattere di quelli ammazza il file prima ancora che arrivi a
   Word. Provato il 17 settembre 2026: un prodotto chiamato «Acqua<NUL>naturale»
   produce un .docx che LibreOffice - il riferimento dichiarato in documento.md -
   si rifiuta di aprire, e non tira fuori nemmeno il titolo. Il guaio e' che un
   nome cosi' non resta sul telefono di chi l'ha battuto: va nel listino che il
   server passa a TUTTI i dispositivi, e da quel momento la giornata in Word non
   si scarica piu' da nessuna parte.

   I proibiti sono tre famiglie, e si riconoscono cosi':

   - i caratteri di comando sotto lo spazio, TRANNE tabulazione (\x09), a capo
     (\x0A) e ritorno a capo (\x0D), che invece sono legittimi e vanno tenuti:
     un nome scritto su due righe deve restare su due righe;
   - i due «non caratteri» in fondo al piano base, U+FFFE e U+FFFF, che non sono
     caratteri di comando e passerebbero inosservati a un controllo fatto solo
     sui codici bassi;
   - meta' di una coppia surrogata rimasta da sola. Gli emoji sono scritti a
     coppie - due pezzi che valgono un carattere solo - e se ne arriva uno
     spaiato, per un nome tagliato a meta' da qualche parte, quel pezzo da solo
     e' illegale tanto quanto un NUL.

   Al posto di ognuno si mette «�», il rombo col punto interrogativo. Non si
   toglie e basta per due ragioni: cancellandolo «Acqua<NUL>naturale» diventerebbe
   «Acquanaturale» e il difetto sparirebbe dalla vista invece che dal foglio; e
   perche' e' gia' la sostituzione che TextEncoder fa da se' sui surrogati
   spaiati, quindi cosi' le tre famiglie si comportano tutte allo stesso modo.

   Questa e' la seconda rete, non la prima: i nomi cattivi il server li rifiuta
   in ingresso. Serve lo stesso, perche' un nome puo' arrivare anche da uno stato
   salvato sul telefono da prima che quel cancello esistesse. */
function xml(testo) {
  return String(testo)
    // L'alternanza guarda prima la coppia intera: se e' buona resta com'e',
    // e quello che avanza e' per forza un pezzo spaiato.
    .replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]|[\uD800-\uDFFF]/g, function (c) {
      return c.length === 2 ? c : '�';
    })
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F￾￿]/g, '�')
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
   altre sono numeri e stanno strette.

   «Quello che avanza» regge finche' le colonne sono poche, e poi si ribalta: a
   1900 l'una, da SETTE colonne in su le strette si mangiano piu' dell'intero
   foglio e alla prima ne restava meno di zero - con sette veniva -1762. Una
   larghezza negativa in un documento Word non vuol dire niente: l'OOXML dichiara
   w:w come misura senza segno.

   Va detto quanto e' grave davvero: oggi la giornata stampa TRE colonne - le
   passa scaricaGiornataWord() in cassa.js - e il conto non ci arriva nemmeno
   vicino. Non e' un guasto in corso, e' una trappola per il giorno in cui
   qualcuno aggiunge una colonna. La si chiude adesso perche' costa tre righe e
   perche' quel giorno il sintomo sarebbe di nuovo «il file e' danneggiato», che
   non dice a nessuno dove guardare.

   Il conto si fa al contrario: prima si mette da parte il minimo per il nome -
   2268, cioe' quattro centimetri, sotto i quali «Cornetto alla crema» non sta su
   una riga - e solo quello che resta si divide fra le altre. Cosi' a stringersi
   sono le colonne dei numeri, che sono cifre corte e se lo possono permettere,
   e non la prima, che sparirebbe. Con tre colonne il risultato non cambia di un
   ventesimo di punto: 1900 sta ben dentro il margine, e il foglio di oggi resta
   identico a prima. */
function larghezze(quante) {
  var MINIMA = 2268;
  if (quante < 2) { return [LARGHEZZA]; }

  var stretta = Math.max(1, Math.min(1900, Math.floor((LARGHEZZA - MINIMA) / (quante - 1))));
  var colonne = [LARGHEZZA - stretta * (quante - 1)];
  for (var i = 1; i < quante; i++) { colonne.push(stretta); }
  return colonne;
}

/* Una riga della tabella. La prima colonna e' testo e sta a sinistra, tutte le altre
   sono cifre e vanno a destra: incolonnate, si confrontano a occhio. */
function rigaTabella(celle, colonne, m) {
  var out = '<w:tr>';

  celle.forEach(function (testo, i) {
    /* Una riga puo' avere piu' celle dell'intestazione - basta che chi prepara i
       blocchi aggiunga un campo a una riga sola e si scordi dell'intestazione. In
       quel caso colonne[i] non esiste, e nell'attributo finiva scritto
       w:w="undefined", che non e' un numero: l'XML si legge lo stesso, ma la
       misura non c'e' piu'. Si ripiega sull'ultima larghezza dichiarata - quella
       delle colonne dei numeri, che e' anche la piu' probabile per una cella in
       piu' - invece di buttare via la cella: un dato che si vede storto si
       corregge, un dato sparito non lo cerca nessuno. */
    var larga = colonne[i] === undefined
      ? (colonne.length ? colonne[colonne.length - 1] : LARGHEZZA)
      : colonne[i];

    var c = '<w:tcPr><w:tcW w:w="' + larga + '" w:type="dxa"/>';
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

// --------------------------------------------------------------- il foglio Excel

/* Il riepilogo dell'anno in Excel: un .xlsx vero, costruito come il .docx qui sopra.

   PERCHE' NON PIU' IL .CSV. Fino alla versione 16 il riepilogo era un .csv, cioe'
   testo con i punti e virgola in mezzo. Excel sul PC lo apriva bene, ma tutto il
   resto doveva indovinare: su un telefono finiva spesso tutto in una colonna sola,
   e «19,50» era un numero o una parola a seconda della lingua del programma. Un
   .xlsx dice da se' cosa c'e' in ogni cella - questo e' un numero, questa una data,
   questo un testo - e nessuno deve indovinare niente.

   E' lo stesso zip di sempre, con dentro altri file XML: il quaderno, un foglio per
   ogni linguetta, gli stili, e l'elenco delle parole.

   COSA RICEVE. Un elenco di fogli, ognuno {nome, larghezze, fisse, orizzontale, righe}:
     - nome: quello della linguetta in basso;
     - larghezze: quanto e' larga ogni colonna, in caratteri;
     - fisse: quante righe in alto restano ferme mentre si scorre;
     - orizzontale: se in stampa il foglio va messo di traverso;
     - righe: {tipo, celle}, coi tipi elencati in STILI_FOGLIO.
   Una cella e' un testo, oppure {numero, formato} col formato 'intero' o 'euro',
   oppure {data: 'AAAA-MM-GG'}, oppure null se resta vuota.

   QUI DENTRO NON SI CONTANO SOLDI nemmeno adesso. Gli euro arrivano gia' euro da
   cassa.js, e qui si scrivono come numeri col punto, perche' e' cosi' che li vuole
   il file: la virgola e il simbolo li mette Excel quando li mostra. L'unica cosa che
   si aggiunge e' la formula delle righe «totale», § cellaFoglio. */

/* Come si vede ogni tipo di riga. I numeri sono le posizioni in <cellXfs>, dentro
   STILI_XML qui sotto: «testo» per le celle di parole, «intero», «euro» e «data»
   per le altre, «rientrato» per un testo subito a destra di una colonna di numeri,
   § colonneDiNumeri. */
var STILI_FOGLIO = {
  titolo:       { testo: 1 },
  tenue:        { testo: 2 },
  forte:        { testo: 3 },
  intestazione: { testo: 4, numero: 5, rientrato: 13 },
  riga:         { testo: 0, intero: 7, euro: 8, data: 6, rientrato: 12 },
  totale:       { testo: 9, intero: 10, euro: 11, data: 9, rientrato: 9 },
  vuota:        { testo: 0 }
};

/* Gli stili veri, nell'ordine che il formato pretende. Due trappole, tutte e due
   scritte nelle specifiche e tutte e due capaci di far dire a Excel «il file e'
   danneggiato»: i primi due riempimenti devono essere proprio «nessuno» e «grigio
   al 12,5%», anche se nessuna cella li usa; e gli elenchi dentro styles.xml vanno
   in quest'ordine - formati, caratteri, riempimenti, bordi, stili.

   I due formati nostri: gli euro con due decimali e il simbolo dopo, le date come
   giorno, mese e anno. «#,##0» e' uno di quelli che Excel ha gia' dentro, col
   numero 3: i pezzi, coi separatori delle migliaia. */
var STILI_XML =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
  '<numFmts count="2">' +
  '<numFmt numFmtId="164" formatCode="#,##0.00\\ &quot;€&quot;"/>' +
  '<numFmt numFmtId="165" formatCode="dd/mm/yyyy"/>' +
  '</numFmts>' +
  '<fonts count="4">' +
  '<font><sz val="11"/><name val="Calibri"/><family val="2"/></font>' +
  '<font><b/><sz val="11"/><name val="Calibri"/><family val="2"/></font>' +
  '<font><b/><sz val="14"/><color rgb="FF0F766E"/><name val="Calibri"/><family val="2"/></font>' +
  '<font><sz val="10"/><color rgb="FF555555"/><name val="Calibri"/><family val="2"/></font>' +
  '</fonts>' +
  '<fills count="4">' +
  '<fill><patternFill patternType="none"/></fill>' +
  '<fill><patternFill patternType="gray125"/></fill>' +
  '<fill><patternFill patternType="solid"><fgColor rgb="FFEEEEEE"/><bgColor indexed="64"/></patternFill></fill>' +
  '<fill><patternFill patternType="solid"><fgColor rgb="FFF5F5F5"/><bgColor indexed="64"/></patternFill></fill>' +
  '</fills>' +
  '<borders count="3">' +
  '<border><left/><right/><top/><bottom/><diagonal/></border>' +
  '<border><left/><right/><top/><bottom style="thin"><color rgb="FF999999"/></bottom><diagonal/></border>' +
  '<border><left/><right/><top style="thin"><color rgb="FF999999"/></top><bottom/><diagonal/></border>' +
  '</borders>' +
  '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
  '<cellXfs count="14">' +
  // 0 testo normale
  '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
  // 1 titolo, 2 tenue, 3 forte
  '<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
  '<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
  '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
  // 4 intestazione sopra un testo, 5 intestazione sopra un numero: va a destra come lui
  '<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>' +
  '<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right"/></xf>' +
  // 6 data, 7 intero, 8 euro
  '<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="left"/></xf>' +
  '<xf numFmtId="3" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
  '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
  // 9 totale testo, 10 totale intero, 11 totale euro
  '<xf numFmtId="0" fontId="1" fillId="3" borderId="2" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>' +
  '<xf numFmtId="3" fontId="1" fillId="3" borderId="2" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>' +
  '<xf numFmtId="164" fontId="1" fillId="3" borderId="2" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>' +
  // 12 testo rientrato, 13 intestazione rientrata
  '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment horizontal="left" indent="1"/></xf>' +
  '<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" indent="1"/></xf>' +
  '</cellXfs>' +
  '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
  '</styleSheet>';

var NS_FOGLIO = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
  'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';

/* Da 0 ad A, da 25 a Z, da 26 ad AA: le colonne di un foglio si chiamano cosi'. */
function lettera(i) {
  var s = '';
  i += 1;
  while (i > 0) {
    var r = (i - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    i = Math.floor((i - 1) / 26);
  }
  return s;
}

/* Excel conta i giorni dal 30 dicembre 1899: il 21 settembre 2026 e' il 46286.
   Il conto si fa in UTC perche' l'ora legale non sposti nessun giorno. */
function giornoExcel(iso) {
  var p = String(iso).split('-');
  return Date.UTC(Number(p[0]), Number(p[1]) - 1, Number(p[2])) / 86400000 + 25569;
}

/* Il nome di una linguetta ha regole sue: al massimo 31 caratteri, e niente
   [ ] : * ? / \ - Excel rifiuta il file intero, non solo la linguetta. I nomi
   li sceglie cassa.js e oggi sono innocui: questa e' la rete per il giorno che
   qualcuno ci mette dentro una data con le barre. */
function nomeLinguetta(nome, i) {
  var n = String(nome || '').replace(/[\[\]:*?\/\\]/g, '-').slice(0, 31);
  return n || 'Foglio ' + (i + 1);
}

/* Una cella. Le parole non si scrivono qui ma in un elenco a parte, comune a tutti
   i fogli, e la cella ne porta solo il numero: e' il modo che tutti i programmi
   leggono, anche quelli dei telefoni.

   Un nome di prodotto che comincia per «=» qui resta testo e basta: e' una cella
   di parole, e Excel non la legge come formula. Il guaio del .csv - l'apice davanti
   da mettere a mano - qui non esiste.

   Le righe «totale» portano una formula: la somma della colonna, dalla prima riga
   dopo l'intestazione all'ultima prima del totale. Accanto c'e' il numero gia'
   fatto da cassa.js, perche' un programma che non ricalcola - i visori dei
   telefoni, spesso - mostri quello e non uno zero. Se si cancella una riga in
   Excel, il totale si rifa' da solo. */
function cellaFoglio(c, dove, tipo, parole, somma, rientro) {
  var stili = STILI_FOGLIO[tipo] || STILI_FOGLIO.riga;
  var r = ' r="' + dove + '"';

  /* Una cella vuota in un'intestazione o in un totale si scrive lo stesso, vuota ma
     col suo fondo grigio: se no la fascia si interrompe proprio dove manca un
     numero, e la riga sembra fatta a pezzi. */
  if (c === null || c === undefined) {
    return tipo === 'intestazione' || tipo === 'totale' ? '<c' + r + ' s="' + stili.testo + '"/>' : '';
  }

  if (typeof c === 'object' && typeof c.data === 'string' &&
      /^\d{4}-\d{2}-\d{2}$/.test(c.data)) {
    return '<c' + r + ' s="' + stili.data + '"><v>' + giornoExcel(c.data) + '</v></c>';
  }

  if (typeof c === 'object' && typeof c.numero === 'number') {
    if (!Number.isFinite(c.numero)) { return ''; }
    var s = c.formato === 'euro' ? stili.euro : stili.intero;
    var f = somma ? '<f>SUM(' + somma + ')</f>' : '';
    return '<c' + r + ' s="' + s + '">' + f + '<v>' + c.numero + '</v></c>';
  }

  var testo = String(typeof c === 'object' ? (c.testo === undefined ? '' : c.testo) : c);
  var st = rientro && stili.rientrato !== undefined ? stili.rientrato : stili.testo;
  return '<c' + r + ' s="' + st + '" t="s"><v>' + parole.numero(testo) + '</v></c>';
}

/* L'elenco delle parole di tutto il file: ogni testo ci entra una volta sola, e le
   celle ne portano il numero. Una Map e non un oggetto, perche' un prodotto che si
   chiama «constructor» o «__proto__» in un oggetto troverebbe un posto gia' occupato. */
function nuoveParole() {
  var posti = new Map();
  var p = { elenco: [], usate: 0 };
  p.numero = function (testo) {
    p.usate += 1;
    if (!posti.has(testo)) {
      posti.set(testo, p.elenco.length);
      p.elenco.push(testo);
    }
    return posti.get(testo);
  };
  return p;
}

/* Quali colonne di una tabella sono di numeri. Lo si capisce dalla riga sotto
   l'intestazione: se li' c'e' un numero, la colonna e' di numeri. Serve a due cose:
   un'intestazione sopra dei numeri va a destra come loro, se no «Incasso (€)» sta a
   sinistra, le cifre sotto stanno a destra, e l'occhio non le lega; e un testo
   subito a destra di una colonna di numeri si stacca di un rientro, se no le cifre
   e le parole si toccano e «0,70 €» e «cassa non chiusa a mano» si leggono come una
   cosa sola. */
function colonneDiNumeri(righe, i) {
  var sotto = righe[i + 1];
  return (righe[i].celle || []).map(function (c, k) {
    var giu = sotto && sotto.celle ? sotto.celle[k] : null;
    return !!(giu && typeof giu === 'object' && typeof giu.numero === 'number');
  });
}

function foglioXml(f, primo, parole) {
  var righe = f.righe || [];
  var xml_righe = '';
  var inizio_tabella = 0;   // la prima riga di dati dopo l'ultima intestazione
  var numeriche = [];       // quali colonne di quella tabella sono di numeri
  var colonne = 1;

  righe.forEach(function (riga, i) {
    var n = i + 1;
    var celle = riga.celle || [];
    var tipo = riga.tipo || 'riga';
    if (celle.length > colonne) { colonne = celle.length; }

    var dentro = '';
    if (tipo === 'intestazione') {
      numeriche = colonneDiNumeri(righe, i);
      var stili = STILI_FOGLIO.intestazione;
      celle.forEach(function (c, k) {
        if (c === null || c === undefined) {
          dentro += cellaFoglio(null, lettera(k) + n, tipo, parole, null, false);
          return;
        }
        var s = numeriche[k] ? stili.numero : (numeriche[k - 1] ? stili.rientrato : stili.testo);
        dentro += '<c r="' + lettera(k) + n + '" s="' + s + '" t="s"><v>' +
          parole.numero(String(c)) + '</v></c>';
      });
      inizio_tabella = n + 1;
    } else {
      // La fascia grigia del totale arriva fin dove arriva l'intestazione.
      var quante = tipo === 'totale' ? Math.max(celle.length, numeriche.length) : celle.length;
      for (var k = 0; k < quante; k++) {
        var somma = null;
        if (tipo === 'totale' && inizio_tabella > 0 && inizio_tabella <= n - 1) {
          somma = lettera(k) + inizio_tabella + ':' + lettera(k) + (n - 1);
        }
        var rientro = (tipo === 'riga' || tipo === 'totale') && k > 0 && !!numeriche[k - 1];
        dentro += cellaFoglio(celle[k], lettera(k) + n, tipo, parole, somma, rientro);
      }
    }

    // Il titolo e' piu' grande: la sua riga si dichiara piu' alta, perche' non tutti
    // i programmi la allargano da soli e il titolo uscirebbe tagliato.
    var alta = tipo === 'titolo' ? ' ht="21" customHeight="1"' : '';
    xml_righe += '<row r="' + n + '"' + alta + '>' + dentro + '</row>';
  });

  var larghezze = f.larghezze || [];
  var cols = larghezze.length ? '<cols>' + larghezze.map(function (w, k) {
    return '<col min="' + (k + 1) + '" max="' + (k + 1) + '" width="' + w + '" customWidth="1"/>';
  }).join('') + '</cols>' : '';
  if (larghezze.length > colonne) { colonne = larghezze.length; }

  var fisse = f.fisse > 0 && f.fisse < righe.length ? f.fisse : 0;
  var vista = '<sheetView workbookViewId="0"' + (primo ? ' tabSelected="1"' : '') + '>';
  if (fisse) {
    var sotto = 'A' + (fisse + 1);
    vista += '<pane ySplit="' + fisse + '" topLeftCell="' + sotto +
      '" activePane="bottomLeft" state="frozen"/>' +
      '<selection pane="bottomLeft" activeCell="' + sotto + '" sqref="' + sotto + '"/>';
  }
  vista += '</sheetView>';

  /* In stampa: A4, tutto il foglio largo una pagina, e quante pagine servono in
     altezza. E' il foglio che va alla scuola, e una colonna che finisce da sola
     su un'altra pagina non la legge nessuno. */
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet ' + NS_FOGLIO + '>' +
    '<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>' +
    '<dimension ref="A1:' + lettera(colonne - 1) + Math.max(1, righe.length) + '"/>' +
    '<sheetViews>' + vista + '</sheetViews>' +
    '<sheetFormatPr defaultRowHeight="15"/>' +
    cols +
    '<sheetData>' + xml_righe + '</sheetData>' +
    '<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/>' +
    '<pageSetup paperSize="9" orientation="' + (f.orizzontale ? 'landscape' : 'portrait') +
    '" fitToWidth="1" fitToHeight="0"/>' +
    '</worksheet>';
}

/* In stampa, l'intestazione delle colonne si ripete in cima a ogni pagina: senza, da
   pagina due in giu' «Pezzi» e «Incasso» sono due colonne di numeri senza nome. E'
   l'ultima delle righe ferme, quella che le tiene ferme anche sullo schermo.

   Il nome della linguetta va fra apici, e un apice dentro il nome si raddoppia: e'
   la regola di Excel per «Prodotti per giorno», che ha degli spazi. */
function righeDaRipetere(nomi, ripetute) {
  var dentro = '';
  nomi.forEach(function (nome, i) {
    var r = ripetute[i];
    if (!r) { return; }
    dentro += '<definedName name="_xlnm.Print_Titles" localSheetId="' + i + '">' +
      xml("'" + nome.replace(/'/g, "''") + "'!$" + r + ':$' + r) + '</definedName>';
  });
  return dentro ? '<definedNames>' + dentro + '</definedNames>' : '';
}

/* Il foglio intero. Un elenco di file come per il .docx, piu' lunghi: ogni linguetta
   e' un file a se', e il quaderno li elenca. */
function fileFoglio(fogli) {
  var parole = nuoveParole();
  var elenco = fogli && fogli.length ? fogli : [{ nome: 'Foglio 1', righe: [] }];
  var nomi = [];
  var usati = {};
  var ripetute = [];

  var pagine = elenco.map(function (f, i) {
    // Due linguette con lo stesso nome rompono il file: la seconda prende un numero.
    var nome = nomeLinguetta(f.nome, i);
    var base = nome;
    var giro = 2;
    while (usati[nome.toLowerCase()]) {
      var coda = ' (' + giro + ')';
      nome = base.slice(0, 31 - coda.length) + coda;
      giro += 1;
    }
    usati[nome.toLowerCase()] = true;
    nomi.push(nome);
    ripetute.push(f.fisse > 0 && f.righe && f.fisse < f.righe.length ? f.fisse : 0);
    return foglioXml(f, i === 0, parole);
  });

  var parole_xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="' +
    parole.usate + '" uniqueCount="' + parole.elenco.length + '">' +
    parole.elenco.map(function (t) {
      return '<si><t xml:space="preserve">' + xml(t) + '</t></si>';
    }).join('') + '</sst>';

  var quaderno = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<workbook ' + NS_FOGLIO + '>' +
    '<bookViews><workbookView activeTab="0"/></bookViews><sheets>' +
    nomi.map(function (n, i) {
      return '<sheet name="' + xml(n) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>';
    }).join('') + '</sheets>' + righeDaRipetere(nomi, ripetute) +
    // Excel rifa' i conti all'apertura: le somme dei totali sono sempre le sue.
    '<calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>';

  var legami = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    nomi.map(function (n, i) {
      return '<Relationship Id="rId' + (i + 1) + '" Target="worksheets/sheet' + (i + 1) +
        '.xml" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet"/>';
    }).join('') +
    '<Relationship Id="rId' + (nomi.length + 1) + '" Target="styles.xml" ' +
    'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles"/>' +
    '<Relationship Id="rId' + (nomi.length + 2) + '" Target="sharedStrings.xml" ' +
    'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings"/>' +
    '</Relationships>';

  var tipi = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    nomi.map(function (n, i) {
      return '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ' +
        'ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>';
    }).join('') +
    '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
    '<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>' +
    '</Types>';

  var radice = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Target="xl/workbook.xml" ' +
    'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument"/>' +
    '</Relationships>';

  var parti = [
    { nome: '[Content_Types].xml', testo: tipi },
    { nome: '_rels/.rels', testo: radice },
    { nome: 'xl/workbook.xml', testo: quaderno },
    { nome: 'xl/_rels/workbook.xml.rels', testo: legami },
    { nome: 'xl/styles.xml', testo: STILI_XML },
    { nome: 'xl/sharedStrings.xml', testo: parole_xml }
  ];
  pagine.forEach(function (p, i) {
    parti.push({ nome: 'xl/worksheets/sheet' + (i + 1) + '.xml', testo: p });
  });
  return parti;
}

var TIPO_EXCEL =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

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

  /* Da un elenco di fogli al file Excel finito. Com'e' fatto un foglio sta scritto
     sopra fileFoglio(). */
  foglio: function (fogli) {
    return new Blob([zip(fileFoglio(fogli))], { type: TIPO_EXCEL });
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
