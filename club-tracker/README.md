# Club Activities Tracker (skeleton)

## Run
```bash
cp .env.example .env          # then edit the secrets
docker compose up --build
docker compose exec api python -m scripts.seed
```
API docs: http://localhost:8000/docs · MinIO console: http://localhost:9001

If you change `001_init.sql`: `docker compose down -v && docker compose up --build`

## Seed logins (password: `password123`)
super@demo.edu · admin@demo.edu · advisor@demo.edu · coord@demo.edu ·
s001@demo.edu / S001 · s002@demo.edu · s003@demo.edu · n001@demo.edu (other campus)

## Verify Stage 1
```bash
curl localhost:8000/health

# log in as a student and save the token
TOKEN=$(curl -s -X POST localhost:8000/auth/login -H 'Content-Type: application/json' \
  -d '{"identifier":"s001@demo.edu","password":"password123"}' | python -c "import sys,json;print(json.load(sys.stdin)['access_token'])")

curl -H "Authorization: Bearer $TOKEN" localhost:8000/clubs
curl -X POST -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"type":"primary"}' localhost:8000/clubs/1/join                       # 201
curl -X POST -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"type":"primary"}' localhost:8000/clubs/2/join                       # 409: limit
docker compose exec api pytest tests/unit                                    # state machines
```
Then log in as `coord@demo.edu` and approve via
`POST /memberships/{id}/decision {"decision":"approve"}`.
Try the other-campus student `n001@demo.edu` joining club 1 (403) and a
second student filling Robotics (capacity 2) to see "Club is full".