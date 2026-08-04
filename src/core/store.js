const STORE = {
  getUser: function(name) {
    try {
      if (typeof window.storage === "undefined") return Promise.resolve(null);
      return window.storage.get("user:" + name.toLowerCase(), true)
        .then(function(r) { return r && r.value ? JSON.parse(r.value) : null; })
        .catch(function() { return null; });
    } catch(e) { return Promise.resolve(null); }
  },
  setUser: function(u) {
    try {
      if (typeof window.storage === "undefined") return Promise.resolve();
      return window.storage.set("user:" + u.name.toLowerCase(), JSON.stringify(u), true)
        .catch(function() {});
    } catch(e) { return Promise.resolve(); }
  },
  listUsers: function() {
    try {
      if (typeof window.storage === "undefined") return Promise.resolve([]);
      return window.storage.list("user:", true)
        .then(function(keys) {
          var promises = (keys.keys || []).map(function(k) {
            return window.storage.get(k, true).then(function(r) { return r && r.value ? JSON.parse(r.value) : null; }).catch(function() { return null; });
          });
          return Promise.all(promises).then(function(arr) { return arr.filter(Boolean); });
        })
        .catch(function() { return []; });
    } catch(e) { return Promise.resolve([]); }
  }
};

const BUILTIN = [
  { id: "ch_kapitel4", parent_id: null, title: "Kapitel 4", color: "#0369a1", icon: "📗", is_builtin: false, sentences: [], words: [] },
  { id: "c1", parent_id: "ch_k4_legacy", title: "Geburtstag & Jahreszeiten", color: "#0f766e", icon: "🎂", is_builtin: true, sentences: [], words: [
    { word: "birthday", clue: "Geburtstag", important: true, topic: "c1" }, { word: "calendar", clue: "Kalender", important: true, topic: "c1" },
    { word: "sing", clue: "singen", important: false, topic: "c1" }, { word: "month", clue: "Monat", important: true, topic: "c1" },
    { word: "celebrate", clue: "feiern", important: true, topic: "c1" }, { word: "enjoy", clue: "genießen", important: true, topic: "c1" },
    { word: "take", clue: "(mit)nehmen", important: true, topic: "c1" }, { word: "balloon", clue: "Luftballon", important: false, topic: "c1" },
    { word: "bring", clue: "(mit)bringen", important: true, topic: "c1" }, { word: "spring", clue: "Frühling", important: true, topic: "c1" },
    { word: "summer", clue: "Sommer", important: true, topic: "c1" }, { word: "autumn", clue: "Herbst", important: true, topic: "c1" },
    { word: "winter", clue: "Winter", important: true, topic: "c1" }, { word: "date", clue: "Datum", important: true, topic: "c1" },
    { word: "first", clue: "erste(r,s)", important: true, topic: "c1" }, { word: "second", clue: "zweite(r,s)", important: true, topic: "c1" },
    { word: "third", clue: "dritte(r,s)", important: true, topic: "c1" }, { word: "dream", clue: "Traum", important: true, topic: "c1" },
    { word: "something", clue: "etwas", important: true, topic: "c1" }, { word: "ride", clue: "reiten, fahren", important: false, topic: "c1" },
  ]},
  { id: "c2", parent_id: "ch_k4_legacy", title: "Party & Essen", color: "#7c3aed", icon: "🎉", is_builtin: true, sentences: [], words: [
    { word: "fireworks", clue: "Feuerwerk", important: true, topic: "c2" }, { word: "present", clue: "Geschenk", important: true, topic: "c2" },
    { word: "drink", clue: "Getränk", important: false, topic: "c2" }, { word: "ice", clue: "Eis", important: false, topic: "c2" },
    { word: "wonderful", clue: "wunderbar", important: true, topic: "c2" }, { word: "price", clue: "Preis", important: true, topic: "c2" },
    { word: "free", clue: "frei, gratis", important: true, topic: "c2" }, { word: "guest", clue: "Gast", important: false, topic: "c2" },
    { word: "lemonade", clue: "Limonade", important: true, topic: "c2" }, { word: "juice", clue: "Saft", important: true, topic: "c2" },
    { word: "invitation", clue: "Einladung", important: true, topic: "c2" }, { word: "card", clue: "Karte", important: true, topic: "c2" },
    { word: "lazy", clue: "faul, träge", important: true, topic: "c2" }, { word: "sleep", clue: "schlafen", important: true, topic: "c2" },
    { word: "buffet", clue: "Büfett", important: false, topic: "c2" }, { word: "coffee", clue: "Kaffee", important: false, topic: "c2" },
  ]},
  { id: "c3", parent_id: "ch_kapitel4", title: "Monate", color: "#b45309", icon: "📅", is_builtin: true, sentences: [], words: [
    { word: "January", clue: "Januar", important: true, topic: "c3" }, { word: "February", clue: "Februar", important: true, topic: "c3" },
    { word: "March", clue: "März", important: true, topic: "c3" }, { word: "April", clue: "April", important: true, topic: "c3" },
    { word: "May", clue: "Mai", important: true, topic: "c3" }, { word: "June", clue: "Juni", important: true, topic: "c3" },
    { word: "July", clue: "Juli", important: true, topic: "c3" }, { word: "August", clue: "August", important: true, topic: "c3" },
    { word: "September", clue: "September", important: true, topic: "c3" }, { word: "October", clue: "Oktober", important: true, topic: "c3" },
    { word: "November", clue: "November", important: true, topic: "c3" }, { word: "December", clue: "Dezember", important: true, topic: "c3" },
  ]},
  { id: "c4", parent_id: "ch_k4_legacy", title: "Kommunikation & Sport", color: "#0369a1", icon: "📱", is_builtin: true, sentences: [], words: [
    { word: "holiday", clue: "Urlaub, Ferien", important: true, topic: "c4" }, { word: "text", clue: "SMS senden", important: true, topic: "c4" },
    { word: "shop", clue: "einkaufen", important: true, topic: "c4" }, { word: "score", clue: "Tor schießen", important: true, topic: "c4" },
    { word: "goal", clue: "Ziel, Tor", important: true, topic: "c4" }, { word: "collect", clue: "(ein)sammeln", important: true, topic: "c4" },
    { word: "close", clue: "schließen", important: true, topic: "c4" }, { word: "bag", clue: "Tasche", important: true, topic: "c4" },
    { word: "case", clue: "Hülle", important: true, topic: "c4" }, { word: "train", clue: "trainieren", important: true, topic: "c4" },
    { word: "plan", clue: "planen", important: true, topic: "c4" }, { word: "field", clue: "Spielfeld", important: false, topic: "c4" },
    { word: "fun", clue: "Spaß", important: false, topic: "c4" }, { word: "gym", clue: "Turnhalle", important: false, topic: "c4" },
  ]},
  { id: "c5", parent_id: "ch_k4_legacy", title: "Einkaufen", color: "#be185d", icon: "🛍️", is_builtin: true, sentences: [], words: [
    { word: "cheap", clue: "billig, preiswert", important: true, topic: "c5" }, { word: "expensive", clue: "teuer", important: true, topic: "c5" },
    { word: "customer", clue: "Kunde/Kundin", important: true, topic: "c5" }, { word: "any", clue: "(irgend)ein(e)", important: true, topic: "c5" },
    { word: "somebody", clue: "(irgend)jemand", important: true, topic: "c5" }, { word: "just", clue: "nur, gerade", important: true, topic: "c5" },
    { word: "home", clue: "zu Hause", important: true, topic: "c5" }, { word: "have", clue: "haben, trinken", important: true, topic: "c5" },
    { word: "put", clue: "setzen, legen", important: false, topic: "c5" }, { word: "everything", clue: "alles", important: false, topic: "c5" },
  ]},
  { id: "allgemein", title: "Allgemein", color: "#64748b", icon: "📌", is_builtin: false, parent_id: "ch_k4_legacy", sentences: [], words: [] },
];
// Die eingebauten Offline-Kapitel stammen alle aus Klasse 5 / Englisch.
// "ch_k4_legacy" war nie ein echtes Kapitel — auf "ch_kapitel4" umbiegen, damit
// die Wörter im Kapitel-Baum (Quiz-Auswahl, Fortschritt) nicht verwaisen.
BUILTIN.forEach(function(c){
  if(c.parent_id === "ch_k4_legacy") c.parent_id = "ch_kapitel4";
  if(c.grade == null) c.grade = 5;
  if(!c.language) c.language = "en";
});

var PROGRESS = {
  key: function(uid, word) { return 'wp:' + uid + ':' + word.toLowerCase(); },
  get: function(uid, word) {
    try {
      if (typeof window.storage === "undefined") return Promise.resolve(null);
      return window.storage.get(PROGRESS.key(uid, word))
        .then(function(r) { return r && r.value ? JSON.parse(r.value) : null; })
        .catch(function() { return null; });
    } catch(e) { return Promise.resolve(null); }
  },
  set: function(uid, word, clue, chapId, correct) {
    PROGRESS.get(uid, word).then(function(existing) {
      var data = existing || {history:[]};
      data.history = data.history.concat([correct]).slice(-10);
      data.word = word; data.clue = clue; data.chapId = chapId; data.lastSeen = Date.now();
      try {
        if (typeof window.storage !== "undefined") {
          window.storage.set(PROGRESS.key(uid, word), JSON.stringify(data)).catch(function(){});
        }
      } catch(e) {}
    });
  },
  getAll: function(uid) {
    try {
      if (typeof window.storage === "undefined") return Promise.resolve({});
      return window.storage.list('wp:' + uid + ':')
        .then(function(keys) {
          var promises = (keys.keys || []).map(function(k) {
            return window.storage.get(k).then(function(r) {
              if (r && r.value) { var d = JSON.parse(r.value); return [d.word, d.history]; }
              return null;
            }).catch(function() { return null; });
          });
          return Promise.all(promises).then(function(arr) {
            var map = {};
            arr.filter(Boolean).forEach(function(pair) { map[pair[0]] = pair[1]; });
            return map;
          });
        })
        .catch(function() { return {}; });
    } catch(e) { return Promise.resolve({}); }
  }
};

export { STORE, BUILTIN, PROGRESS };
