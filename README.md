# twitch-keyword-monitor

## Twitch chatküldés beállítása

Az olvasás továbbra is anonim tmi.js-kapcsolattal történik. Chatüzenet küldéséhez a felhasználónak Twitch OAuth engedélyezést kell adnia; a kliens nem kap tokent. A kézi üzenet csak a Küldés gomb felhasználói megnyomására megy ki, az engedélyezett automatikus válaszok pedig a figyelő meglévő szabályai alapján futnak.

A Twitch Developer Console-ban állítsd be az OAuth redirect URL-t, majd ezeket a szerveroldali Vercel environment variable-öket:

```text
TWITCH_CLIENT_ID=...
TWITCH_CLIENT_SECRET=...
TWITCH_OAUTH_REDIRECT_URI=https://twitch-keyword-monitor.vercel.app/api/twitch/auth/callback
TWITCH_TOKEN_ENCRYPTION_KEY=<hosszú véletlen titok>
```

A `TWITCH_CLIENT_ID` és `TWITCH_CLIENT_SECRET` a meglévő csatornalekérdezéshez is szükséges. A `TWITCH_TOKEN_ENCRYPTION_KEY` ne kerüljön Gitbe vagy `NEXT_PUBLIC_*` változóba. A hozzáférési és refresh token titkosított, httpOnly cookie-ban tárolódik, ezért Vercel több példánya között is továbbadható. A szerver a hozzáférési tokent lejárat előtt automatikusan frissíti, Twitch `401` válasznál pedig egyszer frissít és újrapróbálja a küldést. Manuális engedélyezés csak visszavont/érvénytelen refresh token, törölt vagy 30 nap után lejárt cookie esetén szükséges. A Twitch-fióknak a célchatben megfelelő jogosultsággal kell rendelkeznie; ezt a Twitch szabályozza.

## PWA és témák

Az app telepíthető PWA (`manifest.webmanifest`, standalone mód és service worker). iPhone-on a Safari Megosztás menüjében a **Főképernyőhöz adás**, Androidon/Chrome-ban az **Alkalmazás telepítése** használható. A világos és sötét mód a fejlécben váltható; a választás a böngészőben megmarad, első használatkor pedig a rendszer témáját követi.

This is a [Next.js](https://nextjs.org) project bootstrapped with [v0](https://v0.app).

## Built with v0

This repository is linked to a [v0](https://v0.app) project. You can continue developing by visiting the link below -- start new chats to make changes, and v0 will push commits directly to this repo. Every merge to `main` will automatically deploy.

[Continue working on v0 →](https://v0.app/chat/projects/prj_HCi8HtWFuXWA3AIiHGnrC6cqWyMg)

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

## Learn More

To learn more, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.
- [v0 Documentation](https://v0.app/docs) - learn about v0 and how to use it.
