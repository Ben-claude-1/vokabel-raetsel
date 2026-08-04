var SZ = 25;

function canPlace(grid, word, row, col, dir, must) {
  var L = word.length;
  if (row < 0 || col < 0) return false;
  if (dir === "H" && col + L > SZ) return false;
  if (dir === "V" && row + L > SZ) return false;
  if (dir === "H") { if (col > 0 && grid[row][col-1] !== "") return false; if (col+L < SZ && grid[row][col+L] !== "") return false; }
  else { if (row > 0 && grid[row-1][col] !== "") return false; if (row+L < SZ && grid[row+L][col] !== "") return false; }
  var ix = false;
  for (var i = 0; i < L; i++) {
    var r = dir === "H" ? row : row + i, c = dir === "H" ? col + i : col, cell = grid[r][c];
    if (cell !== "") { if (cell.toLowerCase() !== word[i].toLowerCase()) return false; ix = true; }
    else {
      if (dir === "H") { if (r > 0 && grid[r-1][c] !== "") return false; if (r < SZ-1 && grid[r+1][c] !== "") return false; }
      else { if (c > 0 && grid[r][c-1] !== "") return false; if (c < SZ-1 && grid[r][c+1] !== "") return false; }
    }
  }
  return !must || ix;
}

function findSolCells(grid, rows, cols, phrase) {
  var used = new Set(), cells = [];
  for (var li = 0; li < phrase.length; li++) {
    var cands = [];
    for (var r = 0; r < rows; r++) for (var c = 0; c < cols; c++)
      if (!used.has(r+","+c) && grid[r][c].toLowerCase() === phrase[li].toLowerCase()) cands.push({r:r,c:c});
    if (!cands.length) return null;
    var pick = cands[Math.floor((li/phrase.length)*cands.length)];
    used.add(pick.r+","+pick.c); cells.push({r:pick.r,c:pick.c,letter:grid[pick.r][pick.c],pos:li+1});
  }
  return cells;
}

function buildCW(words, solPhrase) {
  var grid = [], placed = [];
  for (var gi = 0; gi < SZ; gi++) { grid.push([]); for (var gj = 0; gj < SZ; gj++) grid[gi].push(""); }
  var sorted = words.slice().sort(function(a,b){ return b.word.length - a.word.length; });
  var fw = sorted[0], r0 = Math.floor(SZ/2), c0 = Math.floor((SZ-fw.word.length)/2);
  for (var fi = 0; fi < fw.word.length; fi++) grid[r0][c0+fi] = fw.word[fi];
  placed.push(Object.assign({}, fw, {row:r0,col:c0,dir:"H"}));
  for (var wi = 1; wi < sorted.length; wi++) {
    var wo = sorted[wi], found = false;
    for (var pi = placed.length-1; pi >= 0 && !found; pi--) {
      var pw = placed[pi];
      for (var pj = 0; pj < pw.word.length && !found; pj++) {
        for (var wj = 0; wj < wo.word.length && !found; wj++) {
          if (pw.word[pj].toLowerCase() !== wo.word[wj].toLowerCase()) continue;
          var dir2 = pw.dir === "H" ? "V" : "H";
          var row2 = pw.dir === "H" ? pw.row - wj : pw.row + pj;
          var col2 = pw.dir === "H" ? pw.col + pj : pw.col - wj;
          if (canPlace(grid, wo.word, row2, col2, dir2, true)) {
            for (var ii = 0; ii < wo.word.length; ii++) {
              var rr = dir2==="H"?row2:row2+ii, cc = dir2==="H"?col2+ii:col2;
              if (grid[rr][cc]==="") grid[rr][cc]=wo.word[ii];
            }
            placed.push(Object.assign({}, wo, {row:row2,col:col2,dir:dir2})); found=true;
          }
        }
      }
    }
  }
  var r1=SZ,r2=0,c1=SZ,c2=0;
  for (var gr=0;gr<SZ;gr++) for (var gc=0;gc<SZ;gc++) if(grid[gr][gc]!==""){r1=Math.min(r1,gr);r2=Math.max(r2,gr);c1=Math.min(c1,gc);c2=Math.max(c2,gc);}
  var rows=r2-r1+1, cols=c2-c1+1;
  var tGrid=[]; for(var tr=0;tr<rows;tr++){tGrid.push(grid[tr+r1].slice(c1,c2+1));}
  var tPlaced=placed.map(function(p){return Object.assign({},p,{row:p.row-r1,col:p.col-c1});});
  var smap={}, keys=[];
  tPlaced.forEach(function(p){var k=p.row+","+p.col;if(!smap[k])smap[k]={H:null,V:null};smap[k][p.dir]=p;});
  keys=Object.keys(smap).sort(function(a,b){var ap=a.split(",").map(Number),bp=b.split(",").map(Number);return ap[0]!==bp[0]?ap[0]-bp[0]:ap[1]-bp[1];});
  var nums={},across=[],down=[],nn=1;
  keys.forEach(function(k){var s=smap[k];nums[k]=nn;if(s.H)across.push({n:nn,clue:s.H.clue,word:s.H.word});if(s.V)down.push({n:nn,clue:s.V.clue,word:s.V.word});nn++;});
  var solCells=solPhrase?(findSolCells(tGrid,rows,cols,solPhrase)||[]):[];
  return {grid:tGrid,nums:nums,across:across,down:down,rows:rows,cols:cols,placed:tPlaced,total:words.length,solCells:solCells};
}

var SOLS = [
  {phrase:"superstar",msg:"⭐ Du bist ein SUPERSTAR!"},
  {phrase:"topschueler",msg:"🧠 Du bist ein TOP-SCHÜLER!"},
  {phrase:"englishpro",msg:"🏆 Du bist ein ENGLISH PRO!"},
  {phrase:"champion",msg:"🥇 Du bist ein CHAMPION!"},
];

export { SZ, canPlace, findSolCells, buildCW, SOLS };
