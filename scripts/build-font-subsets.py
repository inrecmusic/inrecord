#!/usr/bin/env python3
"""產生自行託管的 Noto Sans TC / Noto Serif TC 子集字型（woff2）。

為什麼要自己切：
  next/font/google 掛 Noto Sans TC / Noto Serif TC 時，Google 會把可變字型切成
  100+ 個 unicode-range 分片，首頁一進來就抓 30 幾個 woff2、約 2.5MB——砍字重沒用，
  因為那是「字」的切片不是「字重」的切片。改成自己託管子集後，字型流量由我們決定。

切法（兩層，core / ext）：
  core = repo 裡真的會出現的中文字（全站 UI 文案）＋ ASCII ＋常用標點，
         用精確的 unicode-range 宣告，首頁只會抓這一個檔。
  ext  = 常用繁體中文（Big5 第一層 5401 常用字）扣掉 core 的其餘字，
         unicode-range 開整個 CJK 區塊，**只有頁面真的出現 core 沒有的字**
         （公告／課程標題／學員姓名等資料庫動態內容）瀏覽器才會去抓。
  兩個 @font-face 是同一套字型的不同分片，接在同一條 font-family 後面，
  視覺上完全一致，只是把「冷門字」的流量延後到真的需要時。

保留 wght 可變軸（不切成多個靜態字重）：
  實測同一份字集，VF 一檔 1.5MB 就涵蓋 400–700；切成 4 個靜態字重要 3.5MB。
  軸範圍限制成實際用到的區間（Sans 400–700、Serif 500–600），與先前 Google 只
  提供這些字重時的呈現一致（超出範圍的 font-weight 本來就會被夾到最近的字重）。

用法：python3 scripts/build-font-subsets.py
需求：pip3 install fonttools brotli
產出：app/fonts/*.woff2 以及 app/fonts/unicode-range-core.txt（貼進 layout.jsx 用）
"""
import os
import subprocess
import sys
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "app", "fonts")
WORK = os.path.join(OUT, ".work")

SOURCES = {
    # google/fonts 上的原廠可變字型（OFL 授權，可自行託管）
    "NotoSansTC": "https://raw.githubusercontent.com/google/fonts/main/ofl/notosanstc/NotoSansTC%5Bwght%5D.ttf",
    "NotoSerifTC": "https://raw.githubusercontent.com/google/fonts/main/ofl/notoseriftc/NotoSerifTC%5Bwght%5D.ttf",
}
# 各字族實際用到的字重（grep app/globals.css、各 CSS module 後確認）
AXIS = {"NotoSansTC": "400:700", "NotoSerifTC": "500:600"}

# 全形／半形標點、符號：不在 Big5 第一層，但站上到處都是
PUNCT = (
    "　、。，．・：；！？「」『』（）〔〕【】《》〈〉—…‧～＋－＝／＜＞％＆＊＃＠｜＄"
    "°′″§¶©®™←→↑↓×÷±≈≠≤≥∞⋯‘’“”–—•‹›※"
)
CODE_EXTS = {".js", ".jsx", ".css", ".json", ".md", ".html"}


def repo_chars():
    """掃 app/ components/ lib/ 裡所有會顯示的非 ASCII 字元（跳過 emoji，由系統字型畫）。"""
    found = set()
    for d in ("app", "components", "lib"):
        for dirpath, _dirs, files in os.walk(os.path.join(ROOT, d)):
            if "node_modules" in dirpath or os.sep + "fonts" in dirpath:
                continue
            for f in files:
                if os.path.splitext(f)[1] not in CODE_EXTS:
                    continue
                try:
                    text = open(os.path.join(dirpath, f), encoding="utf-8").read()
                except (UnicodeDecodeError, OSError):
                    continue
                found.update(c for c in text if 0x2000 < ord(c) < 0x1F000)
    return found


def big5_level1():
    """Big5 第一層＝教育部常用國字那批（5401 字），拿來當「動態內容也要能顯示」的底。"""
    out = set()
    for hi in range(0xA4, 0xC7):
        for lo in list(range(0x40, 0x7F)) + list(range(0xA1, 0xFF)):
            try:
                out.add(bytes([hi, lo]).decode("big5"))
            except UnicodeDecodeError:
                pass
    return out


def unicode_range(chars):
    """把字元集壓成 CSS unicode-range 字串（連續碼位合併成區間）。"""
    pts = sorted(ord(c) for c in chars)
    parts, start, prev = [], pts[0], pts[0]
    for p in pts[1:] + [None]:
        if p == prev + 1:
            prev = p
            continue
        parts.append(f"U+{start:X}" if start == prev else f"U+{start:X}-{prev:X}")
        if p is None:
            break
        start = prev = p
    return ",".join(parts)


def run(cmd):
    print("$", " ".join(cmd[:4]), "...")
    subprocess.run(cmd, check=True)


def main():
    os.makedirs(WORK, exist_ok=True)
    ascii_set = {chr(c) for c in range(0x20, 0x7F)}
    core = (repo_chars() | ascii_set | set(PUNCT)) - {"\n", "\t"}
    ext = (big5_level1() | set(PUNCT)) - core
    print(f"core {len(core)} 字 / ext {len(ext)} 字")

    core_file = os.path.join(WORK, "core.txt")
    ext_file = os.path.join(WORK, "ext.txt")
    open(core_file, "w", encoding="utf-8").write("".join(sorted(core)))
    open(ext_file, "w", encoding="utf-8").write("".join(sorted(ext)))

    for name, url in SOURCES.items():
        src = os.path.join(WORK, f"{name}.ttf")
        if not os.path.exists(src):
            print("下載", url)
            urllib.request.urlretrieve(url, src)
        limited = os.path.join(WORK, f"{name}-axis.ttf")
        run([sys.executable, "-m", "fontTools.varLib.instancer", src,
             f"wght={AXIS[name]}", "-o", limited])
        for tier, text_file in (("core", core_file), ("ext", ext_file)):
            run([sys.executable, "-m", "fontTools.subset", limited,
                 f"--text-file={text_file}", "--flavor=woff2",
                 f"--output-file={os.path.join(OUT, f'{name}-{tier}.woff2')}",
                 # 只留排版真的用得到的 OpenType feature；'*' 會把直排等變體字也一起拉進來
                 "--layout-features=ccmp,locl,kern,mark,mkmk,liga",
                 "--no-hinting", "--drop-tables+=DSIG"])

    core_range, ext_range = unicode_range(core), unicode_range(ext)
    js = (
        "// 由 scripts/build-font-subsets.py 產生，勿手動編輯。\n"
        "// CORE：repo 裡目前會出現的中文字＋ASCII＋常用標點（首頁等頁面只需要抓這一片）。\n"
        "// EXT：常用繁體中文（Big5 第一層）扣掉 CORE 的其餘字，供公告／課程標題／學員姓名等\n"
        "// 資料庫動態內容顯示到 CORE 沒收錄的字時，瀏覽器才會另外抓這一片。\n"
        f'export const NOTO_TC_CORE_RANGE =\n  "{core_range}";\n'
        f'export const NOTO_TC_EXT_RANGE =\n  "{ext_range}";\n'
    )
    open(os.path.join(OUT, "unicode-ranges.js"), "w").write(js)
    for f in sorted(os.listdir(OUT)):
        if f.endswith(".woff2"):
            print(f, f"{os.path.getsize(os.path.join(OUT, f)) / 1024:.0f} KB")


if __name__ == "__main__":
    main()
