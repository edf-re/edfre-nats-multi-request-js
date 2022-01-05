# nats-multi-request-js

Library for making NATS requests that receive multiple responses.

<!--

TODO: upload to npm

## Installation

```
npm i nats-multi-request
OR
npm i -S nats-multi-request
```
-->

## Usage

Returns as soon as `expected` responses arrive.

```
import { connect } from 'nats'
import requestMulti from 'nats-multi-request'

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
