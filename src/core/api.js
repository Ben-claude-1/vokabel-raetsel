import { HG, HW_POST, SB_URL } from './config.js';

function sbGet(t, q) {
  return fetch(SB_URL + "/rest/v1/" + t + (q ? "?" + q : ""), { headers: HG, mode: "cors", credentials: "omit" })
    .then(function(r) {
      if (!r.ok) return [];
      return r.text().then(function(txt) {
        if (!txt || txt.trim() === "[]" || txt.trim() === "") return [];
        try { return JSON.parse(txt); } catch(e) { return []; }
      });
    })
    .catch(function(e) { console.log("sbGet:", e.message); return []; });
}

function sbPost(t, b) {
  var headers = Object.assign({}, HW_POST, { "Prefer": "return=representation" });
  return fetch(SB_URL + "/rest/v1/" + t, { method: "POST", headers: headers, body: JSON.stringify(b), mode: "cors", credentials: "omit" })
    .then(function(r) {
      if (!r.ok) return r.text().then(function(txt) { return { _err: true, status: r.status, msg: txt }; });
      return r.text().then(function(txt) {
        if (!txt || txt === "[]" || txt === "") return { _ok: true };
        try { var j = JSON.parse(txt); return Array.isArray(j) ? (j[0] || { _ok: true }) : j; } catch(e) { return { _ok: true }; }
      });
    })
    .catch(function(e) { return { _err: true, msg: e.message }; });
}

function sbPatch(t, b, q) {
  return fetch(SB_URL + "/rest/v1/" + t + "?" + q, { method: "PATCH", headers: HW_POST, body: JSON.stringify(b), mode: "cors", credentials: "omit" })
    .then(function(r) { return r.ok; }).catch(function() { return false; });
}

function sbDel(t, q) {
  return fetch(SB_URL + "/rest/v1/" + t + "?" + q, { method: "DELETE", headers: HG, mode: "cors", credentials: "omit" })
    .then(function() { return true; }).catch(function() { return false; });
}

function updatePresence(pid) {
  var now = new Date().toISOString();
  sbGet('settings','key=eq.presence_'+pid+'&select=key').then(function(d){
    if(d&&d.length>0) sbPatch('settings',{value:now},'key=eq.presence_'+pid);
    else sbPost('settings',{key:'presence_'+pid,value:now});
  }).catch(function(){});
}

function sbSingle(t, q) {
  return sbGet(t, q).then(function(d) { return Array.isArray(d) && d.length > 0 ? d[0] : null; });
}

function simpleHash(str) {
  var s = str + "vocab_salt_2024", h = 5381, h2 = 0;
  for (var i = 0; i < s.length; i++) { h = ((h << 5) + h) ^ s.charCodeAt(i); h2 = (h2 * 31 + s.charCodeAt(i)) | 0; }
  return "fb_" + Math.abs(h).toString(16).padStart(8,"0") + Math.abs(h2).toString(16).padStart(8,"0");
}

function hashPw(pw) { return Promise.resolve(simpleHash(pw)); }

export { sbGet, sbPost, sbPatch, sbDel, updatePresence, sbSingle, simpleHash, hashPw };
