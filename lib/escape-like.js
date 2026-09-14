// lib/escape-like.js — 把要「等值比對」的字串丟進 LIKE／ILIKE 前先跳脫萬用字元。
//
// 為什麼：`.ilike("email", email)` 常被當成「不分大小寫的等值比對」用，但 LIKE 裡 `_` 是單字元萬用、`%` 是任意長度，
// email 帶底線（a_b@x.com）會同時命中 axb@x.com；用在 UPDATE（後台觀看權限覆寫）就會誤改到別人。
// Postgres LIKE 預設跳脫字元是反斜線，PostgREST 會原樣送到 DB，所以在 `\`、`%`、`_` 前補一個反斜線即可。
export function escapeLike(value) {
  return String(value ?? "").replace(/[\\%_]/g, "\\$&");
}
