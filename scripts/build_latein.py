#!/usr/bin/env python3
"""Latein-Vokabeln Lektion 3-9 (Fotos vom 19.10.2026) als k6-fotos/la_*.json schreiben.

Quelle: Lernvokabular des Lateinbuchs, gelesen von den Fotos IMG_5604-5617.
Zeilenformat: Lemma | 2. Spalte (Formen/Grammatik) | deutsche Bedeutung | Wortart
Längenstriche (Makra) sind bewusst weggelassen, damit man die Wörter tippen kann.
Der WIEDERHOLUNG-Kasten oben auf jeder Seite (Wörter aus früheren Lektionen) ist nicht dabei.

Aufruf:  python3 -I scripts/build_latein.py
"""
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# (Lektion, Titel, [(Foto, Buchseite)], Text)
LEKTIONEN = [
    (3, "Auf dem Land", """
@5604 154
equus | equum m. | das Pferd | noun
ego/me | Pers.-Pron. | ich/mich | phrase
tu/te | Pers.-Pron. | du/dich | phrase
nos/nos | Pers.-Pron. | wir/uns | phrase
vos/vos | Pers.-Pron. | ihr/euch | phrase
canis | canem m. | der Hund | noun
delectare | delecto | erfreuen | verb
bos | bovem m. | das Rind, der Ochse | noun
alere | alo | nähren, ernähren | verb
paulo post | | ein wenig später | adverb
villa | villam f. | das Landhaus, das Landgut | noun
salutare | saluto | grüßen | verb
iam | Adv. | schon, gleich, jetzt | adverb
uxor | uxorem f. | die Ehefrau | noun
cena | cenam f. | die Mahlzeit, das Essen | noun
parare | paro | vorbereiten, zubereiten | verb
adiuvare | adiuvo | unterstützen | verb
in | Präp. + Akk. | in (... hinein) | phrase
properare | propero | eilen, sich beeilen | verb
instruere | instruo | anweisen, unterrichten | verb
ante | Präp. + Akk. | vor | phrase
agere | ago | tun, handeln | verb
ad | Präp. + Akk. | zu (... hin) | phrase
bene | Adv. | gut | adverb
caedere | caedo | töten, schlachten | verb
@5605 155
servare | servo | retten | verb
certe | Adv. | sicher, gewiss | adverb
hortus | hortum m. | der Garten | noun
esse | sum, es, est, sumus, estis, sunt | sein | verb
per | Präp. + Akk. | über, durch | phrase
autem | Konj. | aber | phrase
obsecrare | obsecro | anflehen | verb
igitur | Adv. | also | adverb
"""),
    (4, "In der Schule", """
@5606 156
schola | scholam f. | die Schule | noun
ducere | duco | führen | verb
vocare | voco | rufen | verb
magister | magistrum m. | der Lehrer | noun
sedere | sedeo | sitzen | verb
considere | consido | sich hinsetzen | verb
-que | Konj. | und | phrase
habere | habeo | haben, halten | verb
-ne? | | zeigt an, dass es sich um eine Frage handelt | phrase
tabula | tabulam f. | das Wachstäfelchen | noun
discipulus | discipulum m. | der Schüler | noun
discipula | discipulam f. | die Schülerin | noun
nonne? | | etwa nicht?, doch wohl? | phrase
posse | possum, potes, potest, possumus, potestis, possunt | können | verb
discere | disco | lernen | verb
num? | | denn?, etwa? | phrase
scribere | scribo | schreiben | verb
atque | Konj. | und | phrase
legere | lego | lesen | verb
tacere | taceo | schweigen | verb
monere | moneo | ermahnen, mahnen | verb
noli, nolite | + Inf. | zeigt an, dass es sich um ein Verbot handelt | phrase
ita | Adv. | so | adverb
postea | Adv. | danach, später | adverb
@5607 157
quis? | | wer? | phrase
monstrare | monstro | zeigen | verb
ridere | rideo | lachen, (+ Akk.) jdn. auslachen | verb
domum | | nach Hause | adverb
punire | punio | bestrafen | verb
portare | porto | tragen | verb
docere | doceo | unterrichten, lehren | verb
ergo | Adv. | deshalb, also | adverb
"""),
    (5, "Das Forum Romanum", """
@5608 158
forum | forum n. | das Forum, der Marktplatz | noun
Romanus | Romanus m., Romana f., Romanum n. | römisch | adjective
multi | multi m. Pl., multae f. Pl., multa n. Pl. | viele | adjective
monumentum | monumentum n. | das Denkmal | noun
statua | statuam f. | die Statue | noun
parvus | -a, -um | klein | adjective
magnus | -a, -um | groß | adjective
pulcher | pulcher m., pulchra f., pulchrum n. | schön | adjective
prope | Präp. + Akk. | nahe bei | phrase
homo | hominem m. | der Mensch, der Mann | noun
conspicere | conspicio | erblicken, sehen | verb
accedere | accedo | sich nähern, herbeikommen | verb
iratus | -a, -um | zornig, wütend | adjective
amicus | amicum m. | der Freund | noun
amica | amicam f. | die Freundin | noun
facere | facio | machen, tun | verb
cupere | cupio | wollen, wünschen | verb
praebere | praebeo | bieten, gewähren | verb
tam | Adv. | so | adverb
capere | capio | fangen, ergreifen | verb
accusare | accuso | beschuldigen | verb
incipere | incipio | anfangen, beginnen | verb
fur | furem m. | der Dieb | noun
malus | -a, -um | schlecht, böse | adjective
@5609 159
fugere | fugio (+ Akk.) | fliehen (vor), entkommen (vor) | verb
aureus | -a, -um | golden | adjective
donum | donum n. | das Geschenk | noun
reddere | reddo | zurückgeben | verb
aut | Konj. | oder | phrase
mors | mortem f. | der Tod | noun
manere | maneo | bleiben, erwarten | verb
bonus | -a, -um | gut | adjective
rectus | -a, -um | gerade, richtig, ehrlich | adjective
miser | misera, miserum | arm, unglücklich | adjective
profecto | Adv. | tatsächlich | adverb
tutus | -a, -um | sicher | adjective
"""),
    (6, "Im Circus Maximus", """
@5610 160
Circus Maximus | Circi Maximi m. | der Circus Maximus | noun
spectator | spectatoris m. | der Zuschauer | noun
gaudium | gaudii n. | die Freude | noun
agitator | agitatoris m. | der Wagenlenker | noun
praeclarus | -a, -um | berühmt, ausgezeichnet | adjective
tandem | Adv. | schließlich, endlich | adverb
tunica | tunicae f. | die Tunika | noun
meus | -a, -um Poss.-Pron. | mein(e) | adjective
tuus | -a, -um | dein(e) | adjective
noster | -tra, -trum | unser(e) | adjective
vester | -tra, -trum | euer, eure | adjective
suus | -a, -um refl. Poss.-Pron. | sein(e), ihr(e) | adjective
eius | nicht-refl. Poss.-Pron. | sein(e), ihr(e), dessen, deren | phrase
eorum | earum, eorum, nicht-refl. Poss.-Pron. Pl. | deren | phrase
vincere | vinco | siegen, besiegen | verb
verbum | verbi n. | das Wort | noun
non iam | Adv. | nicht mehr | adverb
signum | signi n. | das Zeichen | noun
imperator | imperatoris m. | der Kaiser | noun
tuba | tubae f. | die Trompete | noun
canere | cano | ertönen | verb
dare | do | geben | verb
cuncti | -ae, -a Pl. | alle | adjective
incitare | incito | antreiben, anfeuern | verb
ceteri | -ae, -a Pl. | die übrigen | adjective
arcere | arceo | abwehren, fernhalten | verb
surgere | surgo | aufstehen, sich erheben | verb
@5611 161
inter | Präp. + Akk. | zwischen, unter | phrase
praestare | praesto | sich hervortun, sich auszeichnen, besser sein | verb
crescere | cresco | wachsen | verb
simul | Adv. | gleichzeitig, zugleich | adverb
fere | Adv. | fast, etwa | adverb
tangere | tango | berühren | verb
mortuus | -a, -um | tot | adjective
se | Akk. | sich | phrase
pecunia | pecuniae f. | das Geld | noun
spectare | specto | anschauen, betrachten, sehen | verb
auditor | auditoris m. | der Zuhörer | noun
victor | victoris m. | der Sieger | noun
"""),
    (7, "Badevergnügen für alle!", """
@5612 162
cum | Präp. + Abl. | mit, zusammen mit | phrase
thermae | thermarum f. Pl. | die Thermen | noun
primum | Adv. | zunächst, zuerst | adverb
in | Präp. + Abl. | in, an, auf, bei | phrase
toga | togae f. | die Toga | noun
deponere | depono | ablegen | verb
vestis | vestis f. | die Kleidung | noun
saepe | Adv. | oft | adverb
septimus | -a, -um | der siebte | adjective
hora | horae f. | die Stunde | noun
e, ex | Präp. + Abl. | aus (... heraus), von | phrase
silentium | silentii n. | die Stille, das Schweigen | noun
iucundus | -a, -um | erfreulich, angenehm | adjective
pauci | -ae, -a Pl. | wenige, nur wenige | adjective
aqua | aquae f. | das Wasser | noun
nihil | | nichts | phrase
cogitare | cogito | denken | verb
at | Konj. | aber | phrase
vox | vocis f. | die Stimme | noun
@5613 163
excitare | excito | aufschrecken, aufwecken | verb
patronus | patroni m. | der Schutzherr, der Patron | noun
sermo | sermonis m. | das Gespräch | noun
consilium | consilii n. | der Rat, die Beratung | noun
egregius | -a, -um | hervorragend, herausragend, ausgezeichnet | adjective
occupatus | -a, -um | beschäftigt | adjective
ire | eo, is, it, imus, itis, eunt | gehen | verb
molestus | -a, -um | lästig, unangenehm | adjective
secum | | bei sich | adverb
aestas | aestatis f. | der Sommer | noun
errare | erro | irren, sich irren | verb
quo? | Adv. | wohin? | adverb
a, ab | Präp. + Abl. | von | phrase
accipere | accipio | annehmen, aufnehmen, empfangen | verb
"""),
    (8, "Amphitheater", """
@5614 164
pugna | pugnae f. | der Kampf | noun
gladiator | gladiatoris m. | der Gladiator | noun
arena | arenae f. | die Arena | noun
adesse | adsum | da sein, anwesend sein | verb
inquit | 3. P. Sg. | er/sie/es sagt | verb
pugnare | pugno | kämpfen | verb
ignotus | -a, -um | unbekannt | adjective
arma | armorum n. Pl. | die Waffen | noun
gladius | gladii m. | das Schwert | noun
animadvertere | animadverto | merken, bemerken | verb
petere | peto | angreifen; aufsuchen; fordern, (er)bitten | verb
saevus | -a, -um | wild, heftig | adjective
iactare | iacto | werfen, schleudern | verb
oppugnare | oppugno | angreifen, bestürmen | verb
cadere | cado | fallen | verb
putare | puto | glauben, meinen | verb
in | Präp. + Akk. | in (... hinein); gegen | phrase
intendere | intendo | (gegen jdn.) richten | verb
humi | | auf dem Boden | adverb
iacere | iaceo | liegen | verb
rursus | Adv. | wieder, von neuem | adverb
neque | Konj. | und nicht | phrase
defendere | defendo | verteidigen | verb
iudicium | iudicii n. | das Urteil, die Meinung | noun
aspicere | aspicio | ansehen | verb
alii | -ae, -a Pl. | andere | adjective
@5615 165
mittere | mitto | schicken, wegschicken | verb
valde | Adv. | sehr | adverb
vivere | vivo | leben | verb
"""),
    (9, "Der Theaterbesuch", """
@5616 166
parere | pareo | gehorchen | verb
ianua | ianuae f. | die Tür | noun
aperire | aperio | öffnen | verb
sinere | sino | lassen, zulassen | verb
intrare | intro | betreten, eintreten | verb
is | ea, id Dem.-Pron./Pers.-Pron. | dieser, diese, dieses; er, sie, es | phrase
censere | censeo | denken, meinen | verb
ruri | | auf dem Land | adverb
abire | abeo | weggehen, verschwinden | verb
cedere | cedo | gehen, (zurück)weichen | verb
improbus | -a, -um | schlecht, böse | adjective
fortunae | fortunarum f. Pl. | das Vermögen, die Reichtümer | noun
perdere | perdo | verschwenden, vergeuden | verb
nocere | noceo | schaden | verb
studere | studeo | sich bemühen | verb
bibere | bibo | trinken | verb
licet | | es ist erlaubt | verb
corrumpere | corrumpo | verderben | verb
enim | Konj. | nämlich | phrase
convivium | convivii n. | das Gastmahl, das Festessen | noun
instituere | instituo | veranstalten, ausrichten | verb
curare | curo | (+ de) sich kümmern um | verb
de | Präp. + Abl. | über, von | phrase
vita | vitae f. | das Leben | noun
modo | Adv. | bloß, nur | adverb
scire | scio | wissen, kennen | verb
@5617 167
reprehendere | reprehendo | tadeln | verb
poena | poenae f. | die Strafe | noun
instare | insto | bevorstehen, drohen | verb
"""),
]


def main():
    total = 0
    for num, title, text in LEKTIONEN:
        words = []
        src, page = None, None
        for line in text.strip().splitlines():
            line = line.strip()
            if not line:
                continue
            if line.startswith("@"):
                src, page = line[1:].split()
                continue
            lemma, forms, clue, typ = [p.strip() for p in line.split("|")]
            w = {
                "src": "IMG_" + src,
                "book_page": int(page),
                "theme_num": num,
                "theme_title": "Lektion %d: %s" % (num, title),
                "word": lemma,
                "clue": clue,
                "type": typ,
                "important": True,
            }
            if forms:
                w["forms"] = forms
            words.append(w)
        total += len(words)
        path = os.path.join(ROOT, "k6-fotos", "la_lektion_%d.json" % num)
        json.dump(words, open(path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
        print("Lektion %d: %d Wörter" % (num, len(words)))
    print("Summe:", total)


if __name__ == "__main__":
    main()
