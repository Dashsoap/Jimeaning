# JiMeaning Project

## Deployment

- **Server**: 154.26.239.250:14000
- **SSH**: `sshpass -p 'o38JzxObd2J6' ssh -o PubkeyAuthentication=no root@154.26.239.250`
- **Deploy Command**: `cd /root/jimeaning && git pull && docker compose up -d --build`
- **Docker Compose**: MySQL + Redis + App (multi-stage build with Prisma)
- **Prisma Migrate**: Uses `--accept-data-loss` flag for schema changes

## Tech Stack

- Next.js 15 + TypeScript + Tailwind CSS v4
- Prisma + MySQL + Redis + BullMQ + FFmpeg
- NextAuth for authentication
- Docker deployment

## Key Directories

- `src/app/[locale]/` — Pages (i18n: zh/en)
- `src/app/api/` — API routes
- `src/lib/generators/` — Image/Video/Audio generators (OpenAI, FAL, Google, Fish Audio, ElevenLabs)
- `src/lib/workers/` — BullMQ task handlers
- `src/lib/compose/` — FFmpeg video composition
- `prisma/schema.prisma` — Database schema
