#!/usr/bin/env sh
set -e
npm install
npm run db:generate
npm run db:push
npm run build
npm run start
