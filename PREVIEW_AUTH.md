# Fiskum: autorisert Studio-preview

Denne kontrakten gjelder bare Fiskums eksisterende, innebygde Sanity Studio.
Offentlige sider henter publisert innhold. Utkast hentes bare gjennom den
autoriserte `/preview/`-ruten og lagres ikke i offentlig cache.

## Autorisasjon

1. Studio bruker den allerede innloggede Sanity-klienten og
   `@sanity/preview-url-secret` 2.1.16 til å opprette et midlertidig
   `sanity.previewUrlSecret`-dokument i `drafts.**`. Ingen ny API-nøkkel opprettes.
2. Studio sender dette previewsecretet i JSON-body med `POST /preview/session`.
   API-token og previewsecret brukes aldri i iframe-URL, lokal lagring eller logger.
3. Serveren validerer mot riktig prosjekt/datasett med eksisterende
   `SANITY_API_READ_TOKEN`. Oppslaget bruker eksplisitt Sanity `client.request`
   med POST, `raw`-perspektiv og `no-store`; `client.fetch` velger ellers GET for
   korte spørringer. Bare Fiskums Studio-source, samme Studio-origin og et
   draft-secret yngre enn én time godtas. Permanente delte previewlenker godtas ikke.
4. Godkjent autorisasjon setter en signert cookie i 15 minutter. Den er
   `HttpOnly`, `SameSite=Strict`, `Secure` på HTTPS og avgrenset til `/preview`.
   Signaturen bruker en separat avledet HMAC-nøkkel fra eksisterende server-token;
   cookieverdien inneholder ingen Sanity-nøkkel eller previewsecret.
5. Hver previewforespørsel kontrollerer signatur, prosjekt, datasett, origin og
   utløp. `Referer` gir aldri tilgang. Svar bruker `private, no-store`,
   `Vary: Cookie`, `noindex, nofollow` og tillater bare iframe fra samme origin.

Studio fornyer økten før utløp, ved retur til en bakgrunnsfane og ved en avvist,
utløpt økt. Automatiske feilforsøk begrenses. «Avslutt preview» bruker en
origin-kontrollert DELETE som sletter nettleserens cookie. En allerede kopiert
cookie kan fortsatt være gyldig frem til dens 15-minutters utløp; dette er en
kortvarig signert økt uten sentralt sesjonsregister. Midlertidige Sanity-secrets
ryddes ved lukking og av Sanitys vanlige opprydding for utløpte preview-secrets.

## Konfigurasjon og kontroll

- Prosjekt/datasett følger nettstedets eksisterende `SANITY_*`,
  `SANITY_STUDIO_*` eller `NEXT_PUBLIC_SANITY_*`-konfigurasjon. Serverens lesetoken
  må kunne lese drafts og preview-secret-dokumentet. Det skal aldri ha offentlig
  miljøvariabelprefiks eller bygges inn i Studio.
- Lokale regresjoner: `node --test tests/preview-session.test.mjs`.
  De tester avvisning, utløp, signaturendring, origin/CSRF, prosjekt/datasett,
  feilhåndtering uten nøkkellekkasje og ekte SDK-serialisering frem til nettverkstransporten.
- Med eksisterende innlogget Sanity CLI fra Studio-mappen:
  `sanity exec scripts/check-preview-session.mjs --with-user-token`.
  Valgfrie `PREVIEW_TEST_ORIGIN` og `PREVIEW_TEST_PATH` velger testmiljø og dokument.
  Skriptet oppretter og sletter bare sitt midlertidige preview-secret, publiserer
  ikke innhold og logger bare statuser/booleans.
- Før godkjenning må en faktisk Studio-draft vises i preview, være skjult ved
  et separat offentlig besøk, og publisering/tilbakestilling må kontrolleres.
  Lokale tester eller en gyldig økt alene er ingen slik godkjenning.
