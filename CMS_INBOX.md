# Henvendelser i Sanity

Aktiverte kontaktskjema sender til `/api/forms/contact`. Mottakeren hentes fra publisert `settings.contactEmail`, og `contactFormEnabled` håndheves på serveren. Navn, e-post, telefon, tema og melding valideres og lagres før FormSubmit forsøkes. Skjemaets kvittering sier «mottatt» når CMS-lagring er bekreftet. E-postfeil stopper ikke en allerede lagret henvendelse.

Sett den separate serverhemmeligheten `SANITY_FORM_WRITE_TOKEN` i Vercel før aktivering. Prosjekt/datasett er `qgyys6fw`/`production`, med eksisterende miljøvariabel-overstyringer. Ikke endre lesetokenet til skrivetilgang eller eksponer skriveren via `NEXT_PUBLIC_`/`SANITY_STUDIO_`.

Studio **Henvendelser** viser private `formSubmission.<uuid>`-dokumenter, nyeste først. Oppfølgingsstatus kan endres direkte; innsendte systemfelter er skrivebeskyttet. Opprett/dupliser/publiser er deaktivert for typen for å bevare namespace-beskyttelsen. Slett henvendelser når de ikke lenger trengs. Ikke legg dem i offentlige innholdsspørringer eller eksponer brede lesetokener i nettleseren.

Kjør `node --test tests/form-inbox*.test.mjs`, eksisterende tester og vanlig bygg. Disse testene bruker nettverksmock og sender ingen e-post. Før produksjon må lagring, visning i Studio og avvist anonym GROQ-/dokument-API-lesing bekreftes med en disponibel testpost. API-et svarer feil hvis lagring mangler eller feiler. Eldre tapte innsendinger blir ikke automatisk gjenopprettet. Ved mislykket e-post vises meldingen fortsatt i CMS, med E-postvarsling «Mislyktes».
