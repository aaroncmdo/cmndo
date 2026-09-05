# -*- coding: utf-8 -*-
"""Aus der Patsche — Bildserie (8 Blaetter) nach der Design-Philosophie "Ruhige Evidenz".

1080x1350 (4:5, mobil), gerendert mit 2x Supersampling. Nur Pillow; reportlab nur fuer --pdf.
Farben: Navy #0D1B3E (Ordnung), Ondo #4573A2 (Weg heraus), Creme #F5F1E8 (Papier),
ein einziges Rot fuer den Verlust. Doku: README.md neben dieser Datei.

  python docs/marketing/aus-der-patsche/generator.py          # alle Blaetter
  python docs/marketing/aus-der-patsche/generator.py 3 6      # nur Blatt 03 und 06
  python docs/marketing/aus-der-patsche/generator.py --pdf    # zusaetzlich PDF (nicht committen)
"""
import math
import os
import sys

from PIL import Image, ImageDraw, ImageFont

BASE = os.path.dirname(os.path.abspath(__file__))
FONTS = os.path.join(BASE, "fonts")
REPO = os.path.abspath(os.path.join(BASE, "..", "..", ".."))
OUT = os.path.join(REPO, "claimondo-marketing", "public", "illustrationen", "aus-der-patsche")
os.makedirs(OUT, exist_ok=True)

FONT_URLS = {
    "Montserrat.ttf": "https://github.com/google/fonts/raw/main/ofl/montserrat/Montserrat%5Bwght%5D.ttf",
    "MontserratItalic.ttf": "https://github.com/google/fonts/raw/main/ofl/montserrat/Montserrat-Italic%5Bwght%5D.ttf",
    "JetBrainsMono.ttf": "https://github.com/google/fonts/raw/main/ofl/jetbrainsmono/JetBrainsMono%5Bwght%5D.ttf",
}


def ensure_fonts():
    """Laedt die OFL-Schriften einmalig von Google Fonts nach fonts/ (gitignored)."""
    import urllib.request
    os.makedirs(FONTS, exist_ok=True)
    for name, url in FONT_URLS.items():
        path = os.path.join(FONTS, name)
        if os.path.exists(path) and os.path.getsize(path) > 100_000:
            continue
        print("lade", name, file=sys.stderr)
        urllib.request.urlretrieve(url, path)

W, H = 1080, 1350
S = 2  # Supersampling

NAVY = (13, 27, 62)
ONDO = (69, 115, 162)
LIGHT = (123, 163, 204)
CREAM = (245, 241, 232)
RED = (178, 58, 46)
WHITE = (255, 255, 255)


def mix(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


INK_10 = mix(CREAM, NAVY, 0.10)
INK_20 = mix(CREAM, NAVY, 0.20)
INK_35 = mix(CREAM, NAVY, 0.35)
INK_55 = mix(CREAM, NAVY, 0.55)
PAPER = mix(CREAM, WHITE, 0.55)
RED_20 = mix(CREAM, RED, 0.20)

M = 84  # Rand
TOTAL = 8

_fc = {}


def font(kind, size, weight="Regular"):
    key = (kind, size, weight)
    if key in _fc:
        return _fc[key]
    path = {"sans": "Montserrat.ttf", "italic": "MontserratItalic.ttf", "mono": "JetBrainsMono.ttf"}[kind]
    f = ImageFont.truetype(os.path.join(FONTS, path), int(round(size * S)))
    try:
        f.set_variation_by_name(weight)
    except Exception:
        try:
            f.set_variation_by_name(weight.encode())
        except Exception as e:  # pragma: no cover
            print("Gewicht", weight, e, file=sys.stderr)
    _fc[key] = f
    return f


class Sheet:
    def __init__(self):
        self.im = Image.new("RGB", (W * S, H * S), CREAM)
        self.d = ImageDraw.Draw(self.im)

    # --- Primitive (alle Koordinaten in 1x-Einheiten) ---
    def line(self, x1, y1, x2, y2, color=NAVY, w=1.0):
        self.d.line([(x1 * S, y1 * S), (x2 * S, y2 * S)], fill=color, width=max(1, round(w * S)))

    def dashed(self, x1, y1, x2, y2, color=NAVY, w=1.0, dash=8, gap=6):
        dx, dy = x2 - x1, y2 - y1
        L = math.hypot(dx, dy)
        if L == 0:
            return
        ux, uy = dx / L, dy / L
        t = 0.0
        while t < L:
            e = min(t + dash, L)
            self.line(x1 + ux * t, y1 + uy * t, x1 + ux * e, y1 + uy * e, color, w)
            t += dash + gap

    def rect(self, x, y, w, h, fill=None, outline=None, ow=1.0):
        self.d.rectangle([x * S, y * S, (x + w) * S, (y + h) * S], fill=fill, outline=outline,
                         width=max(1, round(ow * S)) if outline else 0)

    def rrect(self, x, y, w, h, r, fill=None, outline=None, ow=1.0):
        self.d.rounded_rectangle([x * S, y * S, (x + w) * S, (y + h) * S], radius=r * S, fill=fill,
                                 outline=outline, width=max(1, round(ow * S)) if outline else 0)

    def circle(self, cx, cy, r, fill=None, outline=None, ow=1.0):
        self.d.ellipse([(cx - r) * S, (cy - r) * S, (cx + r) * S, (cy + r) * S], fill=fill, outline=outline,
                       width=max(1, round(ow * S)) if outline else 0)

    def arc(self, cx, cy, r, a0, a1, color, w=1.0):
        self.d.arc([(cx - r) * S, (cy - r) * S, (cx + r) * S, (cy + r) * S], a0, a1, fill=color,
                   width=max(1, round(w * S)))

    def poly(self, pts, fill=None, outline=None, ow=1.0):
        p = [(x * S, y * S) for x, y in pts]
        if fill is not None:
            self.d.polygon(p, fill=fill)
        if outline is not None:
            self.d.line(p + [p[0]], fill=outline, width=max(1, round(ow * S)), joint="curve")

    def text(self, x, y, s, f, color=NAVY, anchor="la"):
        self.d.text((x * S, y * S), s, font=f, fill=color, anchor=anchor)

    def width(self, s, f):
        return self.d.textlength(s, font=f) / S

    def tracked(self, x, y, s, f, color, track, anchor="la"):
        total = sum(self.width(c, f) + track for c in s) - track
        if anchor == "ra":
            x = x - total
        elif anchor == "ma":
            x = x - total / 2
        for c in s:
            self.d.text((x * S, y * S), c, font=f, fill=color, anchor="la")
            x += self.width(c, f) + track
        return total

    def wrap(self, s, f, maxw):
        lines, cur = [], ""
        for word in s.split():
            t = (cur + " " + word).strip()
            if self.width(t, f) <= maxw:
                cur = t
            else:
                if cur:
                    lines.append(cur)
                cur = word
        if cur:
            lines.append(cur)
        return lines

    def wrap_balanced(self, s, f, maxw):
        lines = self.wrap(s, f, maxw)
        n = len(lines)
        if n < 2:
            return lines
        w = maxw
        best = lines
        while w > maxw * 0.7:
            w -= 8
            cand = self.wrap(s, f, w)
            if len(cand) != n:
                break
            best = cand
            if self.width(cand[-1], f) >= 0.3 * maxw:
                break
        return best

    def paragraph(self, x, y, s, f, color, maxw, lh):
        lines = self.wrap_balanced(s, f, maxw)
        for i, l in enumerate(lines):
            self.text(x, y + i * lh, l, f, color)
        return y + len(lines) * lh

    def hatch(self, polygon, spacing=10, color=INK_20, w=1.0, angle=45):
        """Diagonale Schraffur, auf ein Polygon maskiert."""
        layer = Image.new("RGBA", self.im.size, (0, 0, 0, 0))
        ld = ImageDraw.Draw(layer)
        xs = [p[0] for p in polygon]
        ys = [p[1] for p in polygon]
        x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
        diag = (x1 - x0) + (y1 - y0)
        k = -diag
        while k < diag:
            # Linie mit Steigung 'angle' durch (x0 + k, y0)
            if angle == 45:
                ld.line([((x0 + k) * S, y0 * S), ((x0 + k + (y1 - y0)) * S, y1 * S)], fill=color + (255,),
                        width=max(1, round(w * S)))
            else:
                ld.line([((x0 + k) * S, y1 * S), ((x0 + k + (y1 - y0)) * S, y0 * S)], fill=color + (255,),
                        width=max(1, round(w * S)))
            k += spacing
        mask = Image.new("L", self.im.size, 0)
        ImageDraw.Draw(mask).polygon([(x * S, y * S) for x, y in polygon], fill=255)
        self.im.paste(layer, (0, 0), Image.composite(layer.split()[3], Image.new("L", self.im.size, 0), mask))

    def stamp(self, cx, cy, s, angle=-8, color=RED, size=15, pad=10):
        f = font("mono", size, "Medium")
        tw = self.width(s, f)
        th = size * 1.3
        w, h = tw + 2 * pad, th + 2 * pad
        layer = Image.new("RGBA", (int(w * S) + 8, int(h * S) + 8), (0, 0, 0, 0))
        ld = ImageDraw.Draw(layer)
        ld.rectangle([2, 2, w * S + 4, h * S + 4], outline=color + (255,), width=round(1.5 * S))
        ld.text(((w / 2) * S + 3, (h / 2) * S + 3), s, font=f, fill=color + (255,), anchor="mm")
        layer = layer.rotate(angle, expand=True, resample=Image.BICUBIC)
        self.im.paste(layer, (int(cx * S - layer.width / 2), int(cy * S - layer.height / 2)), layer)

    def car(self, x, y, w, color, lw=1.0, fill=None):
        """Seitenansicht, Front links, in einer Box w x 0.38w. Liefert die Radmitten."""
        k = w / 100.0
        body = [(3, 30), (8, 24), (14, 21), (30, 19), (38, 9), (48, 6), (64, 6), (75, 10), (83, 19),
                (94, 22), (97, 26), (97, 32), (3, 32)]
        pts = [(x + px * k, y + py * k) for px, py in body]
        self.poly(pts, fill=fill, outline=color, ow=lw)
        wheels = [(x + 24 * k, y + 32 * k), (x + 78 * k, y + 32 * k)]
        for wx, wy in wheels:
            self.circle(wx, wy, 6.5 * k, fill=CREAM if fill is None else fill, outline=color, ow=lw)
            self.circle(wx, wy, 2.4 * k, outline=color, ow=lw)
        # Fenster
        self.poly([(x + 41 * k, y + 10 * k), (x + 49 * k, y + 8 * k), (x + 60 * k, y + 8 * k),
                   (x + 60 * k, y + 18 * k), (x + 34 * k, y + 18 * k)], outline=color, ow=lw)
        self.poly([(x + 63 * k, y + 8 * k), (x + 73 * k, y + 11 * k), (x + 80 * k, y + 18 * k),
                   (x + 63 * k, y + 18 * k)], outline=color, ow=lw)
        return wheels

    def save(self, name):
        out = self.im.resize((W, H), Image.LANCZOS)
        out.save(os.path.join(OUT, name), optimize=True)
        return out


# ----------------------------------------------------------------------------------------------
# Gemeinsamer Rahmen
# ----------------------------------------------------------------------------------------------
def chrome(sh, n, kicker, observation, way_out, footer):
    # Serienmarke oben links (Mono, Textur)
    sh.text(M, 58, "AUS DER PATSCHE", font("mono", 13, "Medium"), INK_55)
    sh.text(M, 78, f"BLATT {n:02d} / {TOTAL:02d}", font("mono", 13, "Regular"), INK_55)
    # Marke oben rechts
    sh.tracked(W - M, 60, "CLAIMONDO", font("sans", 13, "SemiBold"), NAVY, 4.5, anchor="ra")
    # Messkante links (Lineal)
    for i, y in enumerate(range(150, 900, 10)):
        long = i % 5 == 0
        sh.line(M - 44, y, M - 44 + (12 if long else 6), y, INK_35 if long else INK_20, 1)
    # Beobachtung
    sh.text(M, 936, kicker.upper(), font("mono", 13, "Medium"), ONDO)
    size, lh = 44, 56
    while len(sh.wrap(observation, font("sans", size, "Light"), W - 2 * M)) > 3 and size > 34:
        size -= 2
        lh = round(size * 1.27)
    y = sh.paragraph(M, 964, observation, font("sans", size, "Light"), NAVY, W - 2 * M, lh)
    # Der Weg heraus
    y0 = max(1172, y + 44)
    sh.circle(M + 10, y0 + 15, 9, fill=ONDO)
    sh.line(M + 30, y0 + 15, M + 60, y0 + 15, ONDO, 1.5)
    sh.line(M + 60, y0 + 15, M + 52, y0 + 9, ONDO, 1.5)
    sh.line(M + 60, y0 + 15, M + 52, y0 + 21, ONDO, 1.5)
    sh.text(M + 76, y0 - 22, "DER WEG HERAUS", font("mono", 13, "Medium"), ONDO)
    ws = 29
    while len(sh.wrap(way_out, font("sans", ws, "Medium"), W - 2 * M - 76)) > 2 and ws > 23:
        ws -= 1
    sh.paragraph(M + 76, y0, way_out, font("sans", ws, "Medium"), NAVY, W - 2 * M - 76, round(ws * 1.31))
    # Fusszeile
    sh.line(M, 1282, W - M, 1282, INK_20, 1)
    sh.text(M, 1296, footer, font("mono", 12, "Regular"), INK_55)
    sh.text(W - M, 1296, "claimondo.de", font("mono", 12, "Regular"), INK_55, anchor="ra")


def dim_h(sh, x1, x2, y, label, color=INK_55, f=None, above=True):
    """Horizontale Bemassung mit Endstrichen."""
    f = f or font("mono", 12, "Regular")
    sh.line(x1, y, x2, y, color, 1)
    sh.line(x1, y - 6, x1, y + 6, color, 1)
    sh.line(x2, y - 6, x2, y + 6, color, 1)
    sh.text((x1 + x2) / 2, y - 10 if above else y + 10, label, f, color, anchor="mb" if above else "ma")


def dim_v(sh, x, y1, y2, label, color=INK_55, f=None):
    f = f or font("mono", 12, "Regular")
    sh.line(x, y1, x, y2, color, 1)
    sh.line(x - 6, y1, x + 6, y1, color, 1)
    sh.line(x - 6, y2, x + 6, y2, color, 1)
    sh.text(x + 12, (y1 + y2) / 2, label, f, color, anchor="lm")


# ----------------------------------------------------------------------------------------------
# Blatt 01 — Der Anruf
# ----------------------------------------------------------------------------------------------
def sheet_01():
    sh = Sheet()
    cx, cy = M + 300, 470
    # Klingelringe
    for i, r in enumerate(range(44, 330, 30)):
        sh.circle(cx, cy, r, outline=INK_20 if i else INK_35, ow=1)
    sh.circle(cx, cy, 22, fill=NAVY)
    sh.circle(cx, cy, 74, outline=RED, ow=2)
    sh.text(cx + 84, cy - 76, "Stunde 2", font("mono", 13, "Medium"), RED)
    sh.text(cx + 84, cy - 58, "Anruf der gegnerischen", font("mono", 13, "Regular"), RED)
    sh.text(cx + 84, cy - 40, "Haftpflichtversicherung", font("mono", 13, "Regular"), RED)
    # Zeitachse 0–48 h
    ax0, ax1, ay = M, W - M, 800
    sh.line(ax0, ay, ax1, ay, INK_55, 1)
    for h in range(0, 49):
        x = ax0 + (ax1 - ax0) * h / 48
        long = h % 12 == 0
        sh.line(x, ay, x, ay - (14 if long else 6), INK_55 if long else INK_35, 1)
        if long:
            sh.text(x, ay + 12, f"{h} h", font("mono", 12, "Regular"), INK_55, anchor="ma")
    # Marken auf der Achse
    x0 = ax0
    sh.poly([(x0, ay - 30), (x0 + 7, ay - 22), (x0, ay - 14), (x0 - 7, ay - 22)], fill=NAVY)
    sh.text(x0, ay - 58, "Unfall", font("sans", 15, "Medium"), NAVY, anchor="lb")
    x2 = ax0 + (ax1 - ax0) * 2 / 48
    sh.line(x2, ay - 2, x2, ay - 32, RED, 1.5)
    sh.circle(x2, ay - 38, 5, fill=RED)
    x48 = ax1
    sh.circle(x48, ay - 22, 9, fill=ONDO)
    sh.text(x48, ay - 44, "Ihr eigener Gutachter", font("sans", 15, "Medium"), ONDO, anchor="rb")
    sh.text(x48, ay + 30, "meist in unter 48 Stunden", font("mono", 12, "Regular"), ONDO, anchor="ra")
    chrome(
        sh, 1, "Beobachtung 01 · Der Anruf",
        "Die gegnerische Versicherung ruft an. Freundlich und schnell. Am Ende zahlt sie, was ihr eigener Gutachter festlegt.",
        "Sie dürfen Ihren eigenen Gutachter wählen (§ 249 BGB). Termin meist in unter 48 Stunden, für Sie 0 €.",
        "Zeitachse Stunde 0 bis 48 · unverschuldeter Unfall",
    )
    return sh.save("patsche-01-der-anruf.png")


# ----------------------------------------------------------------------------------------------
# Blatt 02 — Der Brief
# ----------------------------------------------------------------------------------------------
def sheet_02():
    sh = Sheet()
    lx, ly, lw, lh = M + 40, 170, 540, 700
    sh.rect(lx, ly, lw, lh, fill=PAPER, outline=INK_35, ow=1)
    # Briefkopf
    sh.rect(lx + 40, ly + 40, 26, 26, fill=NAVY)
    sh.rect(lx + 72, ly + 40, 26, 26, fill=INK_35)
    sh.text(lx + 40, ly + 80, "GEGNERISCHE HAFTPFLICHTVERSICHERUNG", font("mono", 11, "Medium"), INK_55)
    # Anschriftenfeld
    for i in range(4):
        sh.rect(lx + 40, ly + 130 + i * 16, 150 - i * 20, 6, fill=INK_20)
    sh.text(lx + lw - 40, ly + 130, "Schaden-Nr. 4711-0815", font("mono", 11, "Regular"), INK_55, anchor="ra")
    sh.text(lx + lw - 40, ly + 148, "3 Tage nach dem Unfall", font("mono", 11, "Regular"), INK_55, anchor="ra")
    # Betreff
    sh.rect(lx + 40, ly + 230, 300, 8, fill=INK_55)
    # Fliesstext als Balken; Zeile 7 lesbar in Rot
    widths = [460, 440, 455, 380, 450, 430, 0, 445, 300, 0, 450, 420, 455, 260]
    y = ly + 280
    for i, wdt in enumerate(widths):
        if i == 6:
            sh.text(lx + 40, y - 6, "… schicken wir Ihnen unseren Gutachter vorbei.", font("sans", 19, "Medium"), RED)
            sh.text(lx + lw + 24, y + 4, "Zeile 7", font("mono", 11, "Regular"), RED, anchor="lm")
            sh.line(lx + lw + 2, y + 4, lx + lw + 18, y + 4, RED, 1)
        elif wdt:
            sh.rect(lx + 40, y, wdt, 6, fill=INK_20)
        y += 26
    # Unterschriftenzeile
    sh.line(lx + 40, ly + lh - 80, lx + 240, ly + lh - 80, INK_35, 1)
    sh.text(lx + 40, ly + lh - 68, "Schadenmanagement", font("mono", 11, "Regular"), INK_55)
    sh.stamp(lx + lw - 130, ly + lh - 110, "KOSTENLOS FÜR SIE", angle=-7)
    # Rechts: Messmarke
    dim_v(sh, lx + lw + 104, ly, ly + lh, "1 Seite")
    sh.text(lx + lw + 116, ly + lh / 2 + 18, "0 Fotos", font("mono", 12, "Regular"), INK_55, anchor="lm")
    sh.text(lx + lw + 116, ly + lh / 2 + 36, "0 Messwerte", font("mono", 12, "Regular"), INK_55, anchor="lm")
    chrome(
        sh, 2, "Beobachtung 02 · Der Brief",
        "„Wir schicken Ihnen unseren Gutachter vorbei.“ Er arbeitet für die, die ihn schicken. Das steht nicht im Brief.",
        "Sie wählen den Gutachter. Bei fremder Schuld zahlt ihn die gegnerische Versicherung trotzdem.",
        "Schreiben der gegnerischen Haftpflicht · Tag 3 · Zeile 7",
    )
    return sh.save("patsche-02-der-brief.png")


# ----------------------------------------------------------------------------------------------
# Blatt 03 — „Die Werkstatt regelt das"
# ----------------------------------------------------------------------------------------------
def sheet_03():
    sh = Sheet()
    # Grosse Ziffer links
    sh.text(M - 6, 150, "1", font("sans", 330, "Thin"), NAVY)
    sh.text(M + 4, 520, "von 7 Positionen", font("mono", 13, "Regular"), INK_55)
    sh.text(M + 4, 540, "regelt die Werkstatt", font("mono", 13, "Regular"), INK_55)
    # Liste rechts
    items = [("Reparatur", True), ("Wertminderung", False), ("Nutzungsausfall", False), ("Mietwagen", False),
             ("Gutachterkosten", False), ("Unkostenpauschale", False), ("Anwaltskosten", False)]
    x0, x1 = M + 380, W - M
    y = 200
    for label, done in items:
        sh.line(x0, y + 62, x1, y + 62, INK_20, 1)
        sh.text(x0, y + 12, label, font("sans", 26, "Regular" if done else "Light"), NAVY if done else INK_55)
        cx, cy = x1 - 16, y + 30
        if done:
            sh.circle(cx, cy, 15, fill=NAVY)
            sh.line(cx - 7, cy, cx - 2, cy + 5, CREAM, 2)
            sh.line(cx - 2, cy + 5, cx + 8, cy - 6, CREAM, 2)
            sh.text(cx - 32, cy, "erledigt", font("mono", 12, "Regular"), INK_55, anchor="rm")
        else:
            sh.circle(cx, cy, 15, outline=RED, ow=1.5)
            sh.text(cx - 32, cy, "niemand", font("mono", 12, "Regular"), RED, anchor="rm")
        y += 92
    chrome(
        sh, 3, "Beobachtung 03 · Die Werkstatt regelt das",
        "„Wir regeln das mit der Versicherung.“ Die Werkstatt regelt die Reparatur. Sechs weitere Positionen regelt niemand.",
        "Ein Gutachten belegt den Schaden. Unsere Partnerkanzlei macht alle sieben Positionen geltend, für Sie 0 €.",
        "Positionen eines Haftpflichtschadens · 1 von 7 belegt",
    )
    return sh.save("patsche-03-die-werkstatt-regelt-das.png")


# ----------------------------------------------------------------------------------------------
# Blatt 04 — Kostenvoranschlag statt Gutachten
# ----------------------------------------------------------------------------------------------
def page(sh, x, y, w, h, lines, photos=False, outline=INK_35, fill=PAPER):
    sh.rect(x, y, w, h, fill=fill, outline=outline, ow=1)
    yy = y + 22
    for wdt in lines:
        sh.rect(x + 18, yy, wdt, 4, fill=INK_20)
        yy += 12
    if photos:
        for r in range(2):
            for c in range(3):
                sh.rect(x + 18 + c * 48, yy + 8 + r * 34, 40, 26, outline=INK_35, ow=1)
                sh.hatch([(x + 18 + c * 48, yy + 8 + r * 34), (x + 58 + c * 48, yy + 8 + r * 34),
                          (x + 58 + c * 48, yy + 34 + r * 34), (x + 18 + c * 48, yy + 34 + r * 34)], 5, INK_10)


def sheet_04():
    sh = Sheet()
    # links: Kostenvoranschlag, eine Seite
    kx, ky, kw, kh = M + 30, 560, 190, 250
    page(sh, kx, ky, kw, kh, [120, 150, 140, 90, 150, 130, 60])
    sh.text(kx + 18, ky + kh - 34, "Summe", font("mono", 11, "Regular"), INK_55)
    sh.rect(kx + 90, ky + kh - 36, 80, 8, fill=INK_55)
    sh.text(kx, ky + kh + 22, "KOSTENVORANSCHLAG", font("mono", 12, "Medium"), INK_55)
    sh.text(kx, ky + kh + 40, "1 Seite · eine Schätzung", font("mono", 12, "Regular"), INK_55)
    # rechts: Gutachten als Stapel
    gx, gy, gw, gh = M + 470, 210, 300, 400
    n = 16
    for i in range(n - 1, -1, -1):
        ox, oy = i * 6, -i * 6
        top = i == 0
        page(sh, gx + ox, gy - oy + 0, gw, gh, [180, 230, 210, 250, 190, 240, 220, 140] if top else [],
             photos=top, outline=INK_35 if top else INK_20, fill=PAPER if top else mix(CREAM, WHITE, 0.3))
    sb = gy + gh + (n - 1) * 6
    sh.text(gx, sb + 26, "GUTACHTEN", font("mono", 12, "Medium"), NAVY)
    sh.text(gx, sb + 44, "Seiten · Fotos · Messwerte · Restwert · Wertminderung", font("mono", 12, "Regular"),
            INK_55)
    # Bemassung: Hoehe der beiden
    dim_v(sh, W - M - 6, gy, sb, "")
    sh.text(W - M - 20, (gy + sb) / 2, "Beweis", font("mono", 12, "Medium"), NAVY, anchor="rm")
    dim_v(sh, kx - 18, ky, ky + kh, "")
    sh.text(kx - 30, ky + kh / 2, "Zahl", font("mono", 12, "Medium"), INK_55, anchor="rm")
    chrome(
        sh, 4, "Beobachtung 04 · Der Kostenvoranschlag",
        "Ein Kostenvoranschlag schätzt. Ein Gutachten beweist. Die Versicherung kennt den Unterschied ganz genau.",
        "Bei fremder Schuld zahlt die gegnerische Versicherung Ihr Gutachten. Es dokumentiert jede Position.",
        "Beweiskraft im Vergleich · 1 Seite gegen einen Stapel",
    )
    return sh.save("patsche-04-kostenvoranschlag.png")


# ----------------------------------------------------------------------------------------------
# Blatt 05 — Mietwagen „nicht gedeckt"
# ----------------------------------------------------------------------------------------------
def sheet_05():
    sh = Sheet()
    cols, rows, sz, gap = 7, 2, 118, 14
    x0, y0 = M, 170
    day = 1
    for r in range(rows):
        for c in range(cols):
            x, y = x0 + c * (sz + gap), y0 + r * (sz + gap)
            sh.rect(x, y, sz, sz, outline=INK_20, ow=1)
            sh.text(x + 10, y + 8, f"Tag {day}", font("mono", 11, "Regular"), INK_55)
            sh.car(x + 14, y + 52, 90, INK_35, 1)
            sh.line(x + 14, y + 92, x + 104, y + 92, INK_20, 1)
            day += 1
    # Zwischensumme
    y = y0 + rows * (sz + gap) + 40
    sh.text(M - 4, y - 24, "14", font("sans", 170, "Thin"), NAVY)
    sh.text(M + 210, y + 92, "Tage ohne Auto", font("sans", 22, "Light"), NAVY)
    sh.text(M + 210, y + 124, "× 23 bis 219 € pro Tag, je nach Fahrzeugklasse", font("mono", 13, "Regular"), INK_55)
    sh.text(M + 210, y + 144, "= Nutzungsausfall. Er steht Ihnen auch ohne Mietwagen zu.", font("mono", 13, "Regular"),
            INK_55)
    # Das Zitat der Versicherung
    qy = y + 230
    sh.line(M, qy, M, qy + 54, RED, 2)
    sh.text(M + 20, qy + 2, "„Ein Mietwagen ist in Ihrem Fall", font("sans", 19, "Regular"), RED)
    sh.text(M + 20, qy + 28, "leider nicht gedeckt.“", font("sans", 19, "Regular"), RED)
    sh.text(M + 20, qy + 62, "Schadensachbearbeitung, Tag 5", font("mono", 11, "Regular"), INK_55)
    chrome(
        sh, 5, "Beobachtung 05 · Der Mietwagen",
        "„Ein Mietwagen ist nicht gedeckt.“ Jeder Tag ohne Auto ist trotzdem Geld wert. Das nennt sich Nutzungsausfall.",
        "23 bis 219 € pro Tag, je nach Fahrzeug. Das Gutachten legt die Klasse fest, die Gegenseite zahlt.",
        "Nutzungsausfall · 14 Tage · Tabelle nach Fahrzeugklasse",
    )
    return sh.save("patsche-05-der-mietwagen.png")


# ----------------------------------------------------------------------------------------------
# Blatt 06 — Die Kürzung
# ----------------------------------------------------------------------------------------------
def sheet_06():
    sh = Sheet()
    bx, by, bw, bh = M, 330, W - 2 * M, 110
    cut = 0.65
    # Skala oben
    for i in range(0, 101):
        x = bx + bw * i / 100
        long = i % 10 == 0
        sh.line(x, by - 24, x, by - 24 - (12 if long else 5), INK_55 if long else INK_20, 1)
        if i in (0, 50, 100):
            sh.text(x, by - 44, f"{i} %", font("mono", 12, "Regular"), INK_55, anchor="mb")
    # Balken
    sh.rect(bx, by, bw, bh, outline=NAVY, ow=1.5)
    sh.rect(bx, by, bw * cut, bh, fill=NAVY)
    sh.hatch([(bx + bw * cut, by), (bx + bw, by), (bx + bw, by + bh), (bx + bw * cut, by + bh)], 9, RED, 1)
    sh.line(bx + bw * cut, by - 10, bx + bw * cut, by + bh + 10, RED, 2)
    sh.text(bx + 18, by + bh / 2, "Ihr Gutachten", font("sans", 20, "Medium"), CREAM, anchor="lm")
    # Klammer rechts
    ky = by + bh + 34
    sh.line(bx + bw * cut, ky, bx + bw, ky, RED, 1)
    sh.line(bx + bw * cut, ky - 6, bx + bw * cut, ky + 6, RED, 1)
    sh.line(bx + bw, ky - 6, bx + bw, ky + 6, RED, 1)
    sh.text(bx + bw * (cut + 1) / 2, ky + 12, "− 30 bis 40 %", font("mono", 13, "Medium"), RED, anchor="ma")
    sh.text(bx + bw * (cut + 1) / 2, ky + 32, "„Prüfbericht“", font("mono", 13, "Regular"), RED, anchor="ma")
    # Punktfeld: 100 Einheiten, 35 fehlen
    px, py, step = M, 590, (W - 2 * M - 16) / 19
    for i in range(100):
        r, c = divmod(i, 20)
        x, y = px + c * step + 8, py + r * 34 + 8
        if i < 65:
            sh.circle(x, y, 6, fill=NAVY)
        else:
            sh.circle(x, y, 6, outline=RED, ow=1.5)
    sh.text(M, py + 5 * 34 + 22, "100 Einheiten Schaden · 65 bezahlt · 35 „geprüft“", font("mono", 12, "Regular"),
            INK_55)
    sh.text(M, py + 5 * 34 + 42, "Quelle Kürzungsquote: NDR, Verbraucherzentrale, BGH VI ZR 38/22",
            font("mono", 12, "Regular"), INK_55)
    chrome(
        sh, 6, "Beobachtung 06 · Die Kürzung",
        "Der Prüfdienst der Versicherung kürzt Ihr Gutachten. Im Schnitt um 30 bis 40 Prozent. Er nennt das Prüfung.",
        "Unsere Partnerkanzlei holt gekürzte Beträge zurück. Für Sie 0 €, die Kosten trägt die Gegenseite.",
        "Kürzungsquote 30 bis 40 % · Prüfdienst der Haftpflicht",
    )
    return sh.save("patsche-06-die-kuerzung.png")


# ----------------------------------------------------------------------------------------------
# Blatt 07 — Das Restwert-Angebot
# ----------------------------------------------------------------------------------------------
def sheet_07():
    sh = Sheet()
    cx, cy = M + 300, 560
    for r, lab in ((80, "50 km"), (160, "100 km"), (280, "200 km")):
        sh.circle(cx, cy, r, outline=INK_20, ow=1)
        sh.text(cx + 6, cy - r + 6, lab, font("mono", 11, "Regular"), INK_55)
    sh.circle(cx, cy, 8, fill=NAVY)
    sh.text(cx + 16, cy + 4, "Ihr Standort", font("mono", 12, "Medium"), NAVY)
    # regionale Angebote (aus dem Gutachten)
    for (ang, r, lab) in ((200, 120, "Angebot A"), (100, 95, "Angebot B"), (20, 150, "Angebot C")):
        x = cx + r * math.cos(math.radians(ang))
        y = cy + r * math.sin(math.radians(ang))
        sh.circle(x, y, 7, outline=NAVY, ow=1.5)
        sh.text(x + 14, y + 4, lab, font("mono", 11, "Regular"), INK_55)
    # das Angebot von weit weg
    fx, fy = W - M - 12, 236
    sh.dashed(fx, fy, cx + 8, cy - 6, RED, 1, 7, 6)
    sh.circle(fx, fy, 9, fill=RED)
    sh.text(fx + 8, fy - 66, "Höchstgebot", font("mono", 12, "Medium"), RED, anchor="ra")
    sh.text(fx + 8, fy - 48, "Restwertbörse der Versicherung", font("mono", 12, "Regular"), RED, anchor="ra")
    sh.text(fx + 8, fy - 30, "außerhalb des regionalen Marktes", font("mono", 12, "Regular"), RED, anchor="ra")
    # Legende
    sh.circle(M + 8, 880, 6, outline=NAVY, ow=1.5)
    sh.text(M + 24, 880, "regionale Angebote aus dem Gutachten", font("mono", 12, "Regular"), INK_55, anchor="lm")
    chrome(
        sh, 7, "Beobachtung 07 · Das Restwert-Angebot",
        "Plötzlich will jemand am anderen Ende des Landes Ihr Unfallauto kaufen. Die Versicherung hat ihn gefunden. Zufällig.",
        "Ihr Gutachten ermittelt den Restwert regional. Diesen Wert dürfen Sie zugrunde legen.",
        "Restwert · regionaler Markt gegen Online-Börse",
    )
    return sh.save("patsche-07-das-restwert-angebot.png")


# ----------------------------------------------------------------------------------------------
# Blatt 08 — „Nur ein Kratzer"
# ----------------------------------------------------------------------------------------------
def sheet_08():
    sh = Sheet()
    x, y, w = M, 330, W - 2 * M
    k = w / 100.0
    wheels = sh.car(x, y, w, NAVY, 1.5)
    # verborgene Schaeden hinten (Heck rechts)
    hidden = [(x + 80 * k, y + 19 * k), (x + 97 * k, y + 26 * k), (x + 97 * k, y + 32 * k),
              (x + 86 * k, y + 32 * k), (x + 84 * k, y + 27 * k), (x + 78 * k, y + 22 * k)]
    sh.hatch(hidden, 8, INK_20, 1)
    # der Kratzer
    sx0, sy0 = x + 90 * k, y + 27 * k
    sh.line(sx0, sy0, sx0 + 4 * k, sy0 + 0.6 * k, RED, 2)
    dim_h(sh, sx0, sx0 + 4 * k, sy0 - 3 * k, "4 cm", RED, font("mono", 12, "Medium"))
    sh.text(sx0 + 2 * k, sy0 - 7 * k, "sichtbar", font("mono", 12, "Regular"), RED, anchor="mb")
    # Bezugslinien unter dem Fahrzeug
    labels = ["Stoßfängerträger", "Parksensor", "Halterung", "Seitenwand", "Lack, Vorschadenprüfung"]
    ly = y + 46 * k
    xv = x + 90 * k
    sh.line(xv, y + 33 * k, xv, ly + 4 * 30, INK_35, 1)
    for i, lab in enumerate(labels):
        yy = ly + i * 30
        sh.line(x + 66 * k, yy, xv, yy, INK_35, 1)
        sh.circle(xv, yy, 2.5, fill=INK_35)
        sh.text(x + 64 * k, yy, lab, font("mono", 12, "Regular"), INK_55, anchor="rm")
    sh.text(x + 64 * k, ly - 24, "dahinter, nicht sichtbar", font("mono", 12, "Medium"), NAVY, anchor="rm")
    sh.text(M, 200, "Heck, Fahrerseite", font("mono", 13, "Regular"), INK_55)
    sh.text(M, 220, "Maßstab 1 : 20", font("mono", 13, "Regular"), INK_55)
    chrome(
        sh, 8, "Beobachtung 08 · Der Kratzer",
        "„Ist doch nur ein Kratzer.“ Der Kratzer ist das Einzige, was man von außen sieht. Genau das ist sein Trick.",
        "Der Gutachter sieht, was hinter dem Lack liegt. Bevor die Versicherung es kleinrechnet.",
        "Sichtbar 4 cm · dahinter fünf Bauteile · Heck",
    )
    return sh.save("patsche-08-nur-ein-kratzer.png")


if __name__ == "__main__":
    ensure_fonts()
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    which = args or [str(i) for i in range(1, 9)]
    outs = []
    for n in which:
        outs.append(globals()[f"sheet_{int(n):02d}"]())
        print("ok", n, "->", OUT)
    if "--pdf" in sys.argv:
        from reportlab.pdfgen import canvas as rl_canvas
        pdf = os.path.join(BASE, "aus-der-patsche.pdf")
        c = rl_canvas.Canvas(pdf, pagesize=(W / 2, H / 2))
        c.setTitle("Aus der Patsche — Bildserie Claimondo")
        c.setAuthor("Claimondo")
        for i in range(1, 9):
            name = sorted(f for f in os.listdir(OUT) if f.startswith(f"patsche-{i:02d}-"))[0]
            c.drawImage(os.path.join(OUT, name), 0, 0, width=W / 2, height=H / 2)
            c.showPage()
        c.save()
        print("pdf", pdf)
