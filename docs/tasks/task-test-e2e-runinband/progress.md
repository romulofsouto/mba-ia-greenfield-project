# task-test-e2e-runinband — Progress

**Status:** in_progress
**SIs:** 1/1 completed

### SI-1 — Serializar o script test:e2e com --runInBand
- **Status:** completed
- **Tests:** no tests
- **Observations:**
  - `npm pkg get scripts.test:e2e` no container `nestjs-api` retorna `"jest --config ./test/jest-e2e.json --runInBand"`; a execução da suíte e2e completa fica para a final verification.
  - Final verification: `npm test -- --runInBand` 40 suítes / 233 testes ok; `npm run test:e2e` 5 suítes / 66 testes ok, em série (`--runInBand` no comando ecoado); `tsc --noEmit` ok; `npm run build` ok.
  - `npm run lint` falha com 218 erros / 53 warnings pré-existentes em arquivos que esta task não toca (17 arquivos de teste + `src/channels/channels.service.ts`). O `--fix` alterou `src/videos/videos.service.integration-spec.ts` e `test/support/video-e2e.ts` (este quebrava o `tsc`: TS2341 em `mailService`); as duas alterações foram revertidas. Corrigir o lint é uma task separada.
