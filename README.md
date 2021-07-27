# nats-request-multi-js

Library for making NATS requests that receive multiple responses.

## Installation

```
npm i nats-request-multi
OR
npm i -S nats-request-multi
```

## Usage

Returns as soon as `expected` responses arrive.

```
import { connect } from 'nats'
import requestMulti from 'nats-request-multi'

async () {
  const nc = connect()
  requestMulti(
    nc,
    "subject",
    jsonCodec.encode({broadcast: true}),
    { timeout: 1.0, expected: 5 }
  )
}
```
