CONTAINER_NAME=nats-multi-request-js-request-multi-1
setup:
	npm install

scan:
	npm audit

lint:
	npm run lint

format:
	npm run format

check-format:
	npm run check-format

run-without-docker:
	docker-compose run -p 4222:4222 -d nats
	npm run dev

up:
	docker-compose up --build -d

down:
	docker-compose down --remove-orphans

test-integration: up
	sleep 2; docker exec -t ${CONTAINER_NAME} npm run test-integration

test-unit:
	npm run test-unit

test-unit-in-docker:
	docker exec -t ${CONTAINER_NAME} sh -c "npm run test-unit"
