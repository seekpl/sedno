# Sedno

Raport, który klient rozumie. Polskie narzędzie dla SMM-owców: eksport CSV z Meta Business Suite + trzy liczby z panelu profesjonalnego Instagrama → miesięczny raport dla właściciela lokalnej firmy.

- Specyfikacja: [`PROMPT.md`](PROMPT.md)
- Zasady dla każdej sesji: [`CLAUDE.md`](CLAUDE.md)
- Decyzje i założenia: [`docs/decisions.md`](docs/decisions.md)
- System marki (tylko do odczytu): [`brand/`](brand/README.md)

## Uruchomienie

```bash
pnpm install
cp .env.example .env.local   # uzupełnij w kolejnych fazach
pnpm dev                      # http://localhost:3000, komponenty: /dev/komponenty
```

## Skrypty

| Polecenie                                                   | Co robi                                                                                   |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `pnpm lint` / `pnpm typecheck` / `pnpm test` / `pnpm build` | Definicja „gotowe” dla każdej fazy                                                        |
| `pnpm test:e2e`                                             | Playwright: axe, zrzuty, przepływy (buduje i uruchamia aplikację)                         |
| `pnpm tokens`                                               | Generuje `styles/tokens.css` i `lib/brand/tokens.generated.ts` z `brand/tokens.json`      |
| `pnpm assets`                                               | Generuje dane SVG (ikony, logo, pętla) i kopiuje fonty oraz ikony z `brand/` do `public/` |

Plików wygenerowanych nie edytuj ręcznie — testy sprawdzają, że są aktualne.
