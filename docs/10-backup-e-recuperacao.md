# 10 — Backup e recuperação

## Backup

```bash
DATABASE_URL=postgresql://... bash apps/api/scripts/backup.sh ./backups 30
```

Usa `pg_dump --format=custom` (compactado), valida o arquivo com `pg_restore --list` e remove backups com mais de 30 dias. Para agendar diariamente com cron:

```
15 3 * * * cd /opt/ascend && DATABASE_URL=... bash apps/api/scripts/backup.sh /var/backups/ascend 30
```

Mantenha uma cópia fora do servidor (outro disco ou armazenamento de objetos cifrado). Com Docker: `docker compose exec db pg_dump -U rpg -Fc rpg_dev > ascend.dump`.

## Restauração

```bash
DATABASE_URL=postgresql://... bash apps/api/scripts/restore.sh backups/ascend-AAAAMMDDTHHMMSSZ.dump
```

O script pede confirmação digitada. Depois de restaurar:

1. Suba a API (as migrações pendentes são aplicadas sozinhas).
2. Em **Administração → Verificar integridade**, confira se as projeções batem com o livro-razão. Se houver divergência, use **Recalcular projeções**.

## Recuperação de operações parciais

- Toda recompensa, compra e penalidade roda numa transação. Uma falha no meio não deixa estado parcial.
- Se uma projeção divergir (ex.: edição manual no banco), `rebuildProjections()` reconstrói carteira, XP, nível, atributos e habilidades a partir do livro-razão. Isso está coberto por teste.
- O avaliador diário é idempotente: rodar de novo não duplica penalidades nem missões.

## Exportação por usuário

Em **Configurações → Dados → Exportar** sai um JSON com todos os dados do usuário (sem credenciais de integração).
