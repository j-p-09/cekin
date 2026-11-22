# Cekin – osebne finance

Spletna aplikacija (PWA) za sledenje financam: trenutno stanje, viri financ, prihodki/odhodki,
kategorije s proračuni, samodejne naročnine in redni prihodki, statistika, izvoz in varnostne kopije.

**Gostovanje:** GitHub Pages · **Prijava in baza:** Firebase projekt `projekti-sistem` (Authentication + Realtime Database, brezplačni paket Spark)

---

## Zakaj GitHub Pages + Firebase?

| Možnost | Ocena |
|---|---|
| **GitHub Pages + Firebase** ✅ | Brezplačno, hitro, prava varna prijava, pravila dostopa na strežniku, sinhronizacija med napravami, deluje tudi brez povezave. |
| Google Apps Script | Počasen (1–3 s na klic), omejitve kvot, nerodna prijava, slabo za PWA. |
| Samo GitHub (brez baze) | Ni varne prijave, podatki bi bili samo v brskalniku. |

---

## 1. Poveži Firebase projekt `projekti-sistem`

Baza je že vpisana v `js/config.js`:
`https://projekti-sistem-default-rtdb.europe-west1.firebasedatabase.app`

1. **Project settings (zobnik) → General → Your apps.** Če spletna aplikacija že obstaja, odpri njen
   *SDK setup and configuration → Config*. Lahko uporabiš isto ali dodaš novo (`</>`, npr. »Cekin«).
   V `js/config.js` vpiši manjkajoče **`apiKey`**, **`messagingSenderId`** in **`appId`**.
2. **Authentication → Sign-in method → Email/Password** mora biti omogočen.
3. **Authentication → Settings → Authorized domains:** preveri, da je tvoja domena na seznamu.
4. **Realtime Database → Rules:** pravila iz `database.rules.json` **združi** z obstoječimi.
   Obstoječih pravil drugih aplikacij **ne briši**. V obstoječi objekt `"rules": { ... }` dodaj samo
   ključ `"cekin": { ... }`, takole:

```json
{
  "rules": {
    "tvoja-obstojeca-aplikacija": { "...": "..." },
    "cekin": { ...vsebina "cekin" iz database.rules.json... }
  }
}
```
   Nato **Publish**. (Če ima tvoje obstoječe pravilo na vrhu `".read": true` ali `".write": true`,
   ta velja tudi za `cekin/`, ker se pravila v Realtime Database dedujejo navzdol. V tem primeru ga
   premakni na veje posameznih aplikacij.)

Vsi podatki Cekina so v veji `cekin/`, zato se ne mešajo s podatki drugih aplikacij:

```
cekin/admins/{uid}               skrbniki (samo prek konzole)
cekin/config/app                 obvestilo za vse
cekin/profiles/{uid}             profili (ustvari jih skrbnik)
cekin/requests/{uid}             zahteve za dostop
cekin/data/{uid}/accounts|categories|transactions   finančni podatki, dostopni SAMO lastniku
```

## 2. Ustvari skrbnika (samo v Firebase Console, nikjer v kodi)

1. **Authentication → Users → Add user** → e-pošta in geslo skrbnika. (Če račun v projektu že imaš,
   uporabi obstoječega.) Kopiraj njegov **User UID**.
2. **Realtime Database → Data** → pri korenu klikni **+** → ključ `cekin` → znotraj **+** ključ `admins`
   → znotraj **+** ključ = *prilepljen UID*, vrednost = `true` → **Add**.
   Rezultat: `cekin/admins/<UID>: true`
3. Prijavi se v aplikacijo. V **Nastavitvah** se pojavi **Skrbniška plošča**.

Zapisa `cekin/admins` iz aplikacije ni mogoče spreminjati, zato skrbnika ni mogoče »prevzeti«.

## 3. Uporabniki (registracije ni)

Javne registracije ni. Uporabnike dodaja skrbnik:

**Nastavitve → Skrbniška plošča → Dodaj uporabnika** → e-pošta, ime, samodejno ustvarjeno geslo
(ali e-pošta za nastavitev gesla) → podatke kopiraš in jih varno posreduješ uporabniku.

Na plošči lahko uporabniku tudi **onemogočiš / omogočiš dostop** in mu pošlješ **ponastavitev gesla**.

**Računi iz drugih aplikacij istega projekta:** prijava (Authentication) je skupna celotnemu projektu.
Kdor že ima račun zaradi druge aplikacije in se prijavi v Cekin, nima dostopa. Skrbniku pa se pojavi
med **Zahtevami za dostop**, kjer ga z enim klikom odobri ali zavrne. Takih računov aplikacija nikoli
ne briše, ker jih uporabljajo druge aplikacije.
Skrbnik vidi samo profile uporabnikov, **ne pa njihovih transakcij**.

**Zaščita:** brez profila, ki ga ustvari skrbnik, pravila zavrnejo vsak dostop do podatkov.

## 4. Objava na GitHub Pages

Na isti domeni že imaš druge aplikacije, zato Cekin daj v **svojo mapo**, npr. `.../cekin/`:

```
tvoj-repo/
├── druga-aplikacija/
└── cekin/          ← vsebina tega paketa
    ├── index.html
    ├── manifest.webmanifest
    ├── sw.js
    ├── css/  js/  icons/
```

Commit + push → aplikacija je na `https://<uporabnik>.github.io/<repo>/cekin/`.

### Brez trkov z drugimi aplikacijami na isti domeni
- **Manifest** ima svoj `id` (`./?app=cekin`) in `scope` (`./`), zato se namesti kot **ločena aplikacija**
  z lastno ikono. Uporabnik si jo shrani na začetni zaslon poleg ostalih.
- **Service worker** je omejen na mapo `cekin/`, predpomnilnik ima predpono `cekin-`.
- **localStorage** ključi imajo predpono `cekin:`.
- **Firebase** teče kot poimenovana instanca `"cekin"` (ločena seja v brskalniku), podatki pa so v svoji
  veji `cekin/` v bazi.

### Namestitev na telefon
- **Android (Chrome):** meni ⋮ → *Namesti aplikacijo* (ali v Nastavitvah aplikacije → *Namesti aplikacijo*).
- **iPhone (Safari):** gumb Deli → *Dodaj na začetni zaslon*.

### Ikone
| Datoteka | Namen |
|---|---|
| `icons/favicon.ico`, `favicon-16/32.png`, `icon.svg` | Splet (zavihek brskalnika) |
| `icons/apple-touch-icon.png` (180×180) | iPhone / iPad |
| `icons/icon-192.png`, `icon-512.png`, `maskable-512.png` | Android / PWA |

### Posodobitve
Ob vsaki spremembi kode povečaj `VERSION` v `sw.js` (in `APP_VERSION` v `js/config.js`), da uporabniki
dobijo novo različico.

---

## Funkcije

- **Domov:** trenutno stanje (vsota virov), prihodki/odhodki meseca, primerjava s prejšnjim mesecem,
  viri financ, opozorila proračuna, prihajajoče naročnine, zadnje 3 transakcije + *Poglej več*.
- **Oko** skrije vse zneske (zvezdice) – za javna mesta; nastavitev se zapomni.
- **Gumb +** (vedno spodaj desno): odhodek, prihodek ali **prenos med viri**; datum v prihodnosti = *načrtovano*.
- **Transakcije:** iskanje, filtri po vrsti, mesecu, viru in kategoriji, dnevni seštevki, izvoz CSV.
- **Kategorije:** odhodki in prihodki, ikona in barva, **mesečni proračun** z vrstico napredka,
  **naročnina / reden prihodek** (znesek, dan v mesecu, vir, začetek) – knjiži se samodejno.
- **Viri financ:** gotovina, bančni račun, kartica, prihranki, naložbe; začetno stanje (ne gre v zgodovino),
  vključitev v skupno stanje, arhiviranje, **popravek stanja** po bančnem izpisku.
- **Statistika:** prihodki, odhodki, neto, stopnja varčevanja, povprečna dnevna poraba, naročnine na mesec,
  krog po kategorijah, stolpci za 6 mesecev, gibanje premoženja.
- **Nastavitve:** ime, valuta, temna/svetla/sistemska tema, sprememba gesla, CSV, varnostna kopija JSON
  in obnova, brisanje podatkov, namestitev aplikacije.
- **Skrbnik:** dodajanje uporabnikov, onemogočanje dostopa, ponastavitev gesla, statistika uporabnikov,
  obvestilo za vse uporabnike.

### Kako delujejo samodejne naročnine
Brezplačni paket Firebase nima strežniških opravil po urniku, zato se zapadle obremenitve knjižijo
**ob odprtju aplikacije** – tudi za dneve, ko aplikacija ni bila odprta (z datumom zapadlosti).
Vsaka knjižba ima enoličen ID (`rec_<kategorija>_<mesec>`), zato se ne podvoji, tudi če aplikacijo
odpreš na več napravah. Če je dan večji od dolžine meseca (npr. 31.), se knjiži zadnji dan meseca.

## Lokalni (demo) način
Dokler je `apiKey` v `js/config.js` prazen, aplikacija teče lokalno: podatki ostanejo samo v brskalniku.
Za preizkus zaženi `python3 -m http.server` v mapi in odpri `http://localhost:8000`.
