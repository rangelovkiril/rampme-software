# RampMe

[English](../README.md) · Български

**Правим градския транспорт достъпен за всеки.**

RampMe е жива карта на градския транспорт в София, изградена около една достъпностна функция: пътник близо до спирка резервира рампа за инвалидна количка, а вграден хардуерен модул във возилото я разгъва през MQTT при пристигане. Показва всеки автобус, трамвай и тролейбус в реално време, с живи прогнози за пристигане от GTFS фийдовете на Sofia Traffic.

Уникалното е, че човекът, който има нужда от рампата, е този, който я задейства. Никоя друга система в света не поставя пътника директно в контура: навсякъде другаде разгъването на рампата зависи от това шофьорът да забележи и да действа. RampMe премахва тази зависимост.

Това хранилище съдържа двете приложения:

- **`backend/`** е Bun + Elysia REST и SSE API. Декодира статичните и realtime GTFS фийдове и притежава жизнения цикъл на резервацията за рампа.
- **`frontend/`** е Next.js приложение (React + Leaflet), статично експортирано и обслужвано от Cloudflare Pages.

k3s клъстърът, който върти backend-а, се управлява отделно в GitOps хранилището [`fleet`](https://github.com/rangelovkiril/fleet), а firmware-ът на рампата (Raspberry Pi контролерът на всяко возило) се намира в [`rampme-hardware`](https://github.com/rangelovkiril/rampme-hardware). Firmware-ът говори с backend-а единствено през [MQTT протокола за рампата](https://github.com/rangelovkiril/rampme-software/wiki/Ramp-MQTT-Protocol-BG).

## Бърз старт

Единствената предпоставка е [Bun](https://bun.sh) (v1.0 или по-нов). Двете приложения се пускат като отделни процеса; frontend-ът проксира `/api/*` към backend-а в разработка.

```bash
# backend, на :3000
cd backend
bun install
bun run dev

# frontend, във втори терминал (Next взима следващия свободен порт, обикновено :3001)
cd frontend
bun install
bun run dev
```

Backend-ът стартира без брокер: без зададен `MQTT_URL` логва, че MQTT се прескача, и обслужва всичко освен хардуерния път. За да се упражни жизненият цикъл на рампата без хардуер, стартирай backend-а с `MOCK_RAMP=true`.

Преди push пусни същата проверка, която пуска и CI:

```bash
bun run check   # biome + tsc, във всяко приложение
```

## Документация

Пълната документация се намира в [wiki-то](https://github.com/rangelovkiril/rampme-software/wiki):

- [Архитектура](https://github.com/rangelovkiril/rampme-software/wiki/Architecture-BG): как двете приложения се съчетават и как приложението се обслужва
- [Модел на заплахите](https://github.com/rangelovkiril/rampme-software/wiki/Threat-Model-BG): защо няма вход, и как се ограничават злоупотребите
- [CI/CD](https://github.com/rangelovkiril/rampme-software/wiki/CI-CD-BG): пайплайни, поток на бранчовете и gate-ът за промоция
- [MQTT протокол за рампата](https://github.com/rangelovkiril/rampme-software/wiki/Ramp-MQTT-Protocol-BG): контрактът за хардуерния екип
- [Приноси](https://github.com/rangelovkiril/rampme-software/wiki/Contributing-BG): локална настройка и конвенции

Подредбата на кода и правилата за модулите са в [`CLAUDE.md`](../CLAUDE.md). Инфраструктурата и операциите по клъстъра са в [fleet wiki](https://github.com/rangelovkiril/fleet/wiki).

## История

RampMe е направено за 48 часа на HackTUES 12, където зае 4-то място, и после взе 3-то място на TUES Fest. Може по-късно тук да се появят снимки, без обещания. Виж [презентацията](https://www.canva.com/design/DAHFDWV7DkA/-L-Wb9y9991tjE6tHmhyzA/edit) за оригиналния pitch.
