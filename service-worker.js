/* Il pezzo che fa funzionare la cassa senza rete.

   Al primo caricamento mette in una cassaforte del browser tutti i file dell'app;
   da quel momento li serve da li'. Se il wifi della scuola non va, o se il telefono
   e' in aereo, l'app si apre lo stesso.

   QUANDO SI CAMBIA L'APP: alzare il numero di VERSIONE qui sotto. E' quello che dice
   al browser «la copia che tieni e' vecchia, riscaricala». Senza, chi l'ha gia'
   installata resta per sempre alla versione di prima.  */

var VERSIONE = 'cassa-bar-8';

var FILE = [
  './',
  './index.html',
  './stile.css',
  './cassa.js',
  './documento.js',
  './sincronia.js',
  './manifest.webmanifest',
  './icona-192.png',
  './icona-512.png',
  './icona-apple-180.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(VERSIONE).then(function (cassaforte) {
      // 'reload' scavalca la cache normale del browser: senza, appena pubblicata una
      // versione nuova si finirebbe per metterne da parte una gia' vecchia.
      return cassaforte.addAll(FILE.map(function (indirizzo) {
        return new Request(indirizzo, { cache: 'reload' });
      }));
    }).then(function () {
      return self.skipWaiting();
    })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (nomi) {
      return Promise.all(nomi.map(function (n) {
        return n === VERSIONE ? null : caches.delete(n);
      }));
    }).then(function () {
      return self.clients.claim();
    })
  );
});

/* Prima la cassaforte, poi la rete: e' una cassa, deve partire subito e sempre.
   Le richieste che non sono semplici letture non si toccano. */
self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') { return; }

  /* Solo la roba nostra. Le richieste al server della sincronizzazione partono da
     un altro indirizzo e non devono MAI finire in cassaforte: una risposta vecchia
     tenuta da parte vorrebbe dire vedere per giorni un listino sbagliato senza
     capire perche'. Sono tutte POST e gia' la riga sopra le lascerebbe passare,
     ma questa e' la rete di sicurezza che regge anche se un giorno cambiassero. */
  if (new URL(e.request.url).origin !== self.location.origin) { return; }

  e.respondWith(
    caches.match(e.request).then(function (trovato) {
      if (trovato) { return trovato; }

      return fetch(e.request).then(function (risposta) {
        // Si tiene da parte solo quello che arriva davvero dal nostro indirizzo.
        if (risposta && risposta.status === 200 && risposta.type === 'basic') {
          var copia = risposta.clone();
          caches.open(VERSIONE).then(function (cassaforte) {
            cassaforte.put(e.request, copia);
          });
        }
        return risposta;
      }).catch(function () {
        // Senza rete e senza copia: se stava aprendo una pagina, si da' la sua.
        if (e.request.mode === 'navigate') { return caches.match('./index.html'); }
        return Response.error();
      });
    })
  );
});
