# Landing Epilazione Laser 3D — L'Angolo del Benessere (Barletta)

Landing page per le campagne Meta (Facebook + Instagram): una sola pagina veloce, pensata per mobile, con form contatti, WhatsApp, Meta Pixel e Conversions API.
Testi e immagini sono presi dal Taplink del centro (percorso Laser 3D di Mariangela Nevola, testimonianze reali, promo del mese).

**Zero dipendenze**: serve solo Node.js 22, niente `npm install`.

## Pagine
| Indirizzo | Cosa contiene |
|---|---|
| `/` | La landing |
| `/grazie` | Pagina di ringraziamento dopo l'invio del form: qui scatta l'evento **Lead** |
| `/privacy` | Informativa privacy e cookie |
| `/admin` | Elenco dei contatti ricevuti, con stato (nuovo / contattato / prenotato / perso), pulsante WhatsApp con messaggio già pronto ed export CSV |

## Avvio su Replit
1. **Create Repl → Import from GitHub** → incolla l'URL di questo repo → **Run**.
2. Imposta i **Secrets** (tabella sotto). Il minimo indispensabile è `ADMIN_PASSWORD`.
3. Pubblica con **Deploy → Reserved VM**. Non usare Autoscale: i contatti stanno in `data/leads.db` e verrebbero persi.
4. Collega il dominio ed imposta `BASE_URL` (es. `https://laser.angolodelbenessere...`).

## Secrets
| Secret | A cosa serve |
|---|---|
| `ADMIN_PASSWORD` | Password della pagina `/admin` (predefinita `angolo2026`: **cambiala**) |
| `BASE_URL` | Indirizzo pubblico del sito (serve per l'immagine di anteprima nei link condivisi) |
| `META_PIXEL_ID` | ID del Pixel/Dataset in Gestione eventi di Meta |
| `META_CAPI_TOKEN` | Token della Conversions API (Gestione eventi → Impostazioni → Genera token di accesso) |
| `META_TEST_EVENT_CODE` | Facoltativo: codice per provare gli eventi in "Test eventi". Toglilo prima di andare live |
| `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` | **Notifica istantanea** di ogni nuovo contatto sul telefono (gratis). Per più persone, separa i chat ID con la virgola |
| `NOTIFY_EMAIL` + `RESEND_API_KEY` (oppure `BREVO_API_KEY`) + `EMAIL_FROM` | Notifica via email |
| `LEAD_WEBHOOK_URL` | Facoltativo: invia ogni contatto a Make/Zapier/Google Sheets o al gestionale |
| `POSTI_DISPONIBILI` | Sovrascrive il numero di posti della promo senza toccare il codice |

### Come ottenere la notifica Telegram (2 minuti)
1. Su Telegram apri **@BotFather** → `/newbot` → copia il token in `TELEGRAM_BOT_TOKEN`.
2. Scrivi un messaggio qualsiasi al tuo bot, poi apri `https://api.telegram.org/bot<TOKEN>/getUpdates` e copia il numero `chat.id` in `TELEGRAM_CHAT_ID`.

## Modificare testi, prezzi e promo
Si fa tutto dal file **`config.json`**, senza toccare il codice:
- numero di telefono e WhatsApp, indirizzo
- **pacchetti e prezzi** (`prezzo_pieno` mostra il prezzo barrato e il risparmio; `evidenza: true` mette in risalto il pacchetto)
- **posti disponibili** del mese, che compaiono nella barra di scarsità sotto l'hero
- zone selezionabili nel form

⚠️ Il numero di posti deve corrispondere alla realtà: Meta può rifiutare le inserzioni che portano a pagine con scarsità finta.

## Configurazione campagne Meta (consigliata)
- **Obiettivo**: *Lead* (o *Vendite*), con conversione sul sito ed evento **Lead**.
- **URL della pagina con i parametri UTM**, così in `/admin` vedi quale inserzione ha portato ogni contatto:
  `https://TUODOMINIO/?utm_source=facebook&utm_medium=paid&utm_campaign={{campaign.name}}&utm_content={{ad.name}}`
- **Eventi inviati**:
  - `PageView`
  - `ViewContent` (a metà pagina o al clic su una promo)
  - `InitiateCheckout` (quando si inizia a compilare il form)
  - `Lead` (dopo l'invio)
  - `Contact` (clic su WhatsApp o chiamata)

  `Lead` e `Contact` partono sia dal browser sia dal server (Conversions API), con lo stesso `event_id` per la deduplicazione: si recuperano anche le conversioni bloccate da iOS e dagli adblocker.
- **Cookie**: il Pixel si attiva solo dopo il consenso nel banner, come richiesto dal GDPR. La Conversions API invia i dati del lead in forma cifrata (hash).
- **Pubblico**: donne 20–55 anni, raggio di 15–20 km da Barletta. Usa come creatività le foto del trattamento e le testimonianze WhatsApp.
- Evita nelle inserzioni foto "prima/dopo" e frasi che si rivolgono a difetti della persona ("hai troppi peli?"): sono contro le regole pubblicitarie di Meta. Meglio parlare della soluzione: "Dì addio a ceretta e rasoio".

## Struttura
```
server.js          server, salvataggio contatti, notifiche, Meta CAPI, admin
config.json        testi, contatti, pacchetti, posti disponibili
public/index.html  landing
public/style.css   grafica
public/app.js      Pixel + consenso cookie, UTM, form, WhatsApp
public/grazie.html pagina di ringraziamento (evento Lead)
public/admin.html  gestione contatti
public/img/        immagini ottimizzate (WebP)
```
