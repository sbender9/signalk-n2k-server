/*
 * Copyright 2025 Scott Bender <scott@scottbender.net>
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { ServerAPI, Plugin } from '@signalk/server-api'
import { createServer, Server, Socket } from 'net'
import { Unsubscribes } from '@signalk/server-api'
import { parseN2kString, toActisenseSerialFormat } from '@canboat/canboatjs'
import split from 'split'

const start = (app: ServerAPI) => {
  let props: any
  let onStop: any = []
  let server: Server | null

  const plugin: Plugin = {
    start: (properties: any) => {
      props = properties

      server = createServer((socket: Socket) => {
        app.debug(
          'Connected : ' + socket.remoteAddress + ':' + socket.remotePort
        )

        socket.on('error', (err: Error) => {
          app.debug('Error:' + err)
        })
        socket.on('close', (hadError) => {
          app.debug('Close:' + hadError)
        })

        const unsubscibes: Unsubscribes = []

        ;(app as any).on('canboatjs:rawoutput', (output: any) => {
          if (typeof output !== 'string') {
            const timestamp = new Date().toISOString()
            socket.write(
              binToActisense(
                output.pgn,
                timestamp,
                output.data,
                output.length
              ) + '\n'
            )
          } else {
            socket.write(output + '\n')
          }
        })

        socket
          .pipe(split())
          /*
            split((s: string) => {
              if (s.length > 0) {
                try {
                  return JSON.parse(s)
                } catch (e: any) {
                  app.error(e)
                }
              }
            })
              */
          .on('data', socketMessageHandler(app, socket, unsubscibes))
          .on('error', (err: Error) => {
            console.error(err)
          })
        socket.on('end', () => {
          unsubscibes.forEach((f) => f())
          app.debug('Ended')
        })
      })

      server.on('listening', () => app.debug('listening on ' + props.port))
      server.on('error', (e) => {
        app.error(e.message)
      })

      server.listen(props.port)
    },

    stop: function () {
      onStop.forEach((f: any) => f())
      onStop = []
      server?.close()
      server = null
    },

    id: 'signalk-n2k-server',
    name: 'SignalK N2K Server',
    description: 'Signal K Plugin For N2K Server',

    schema: () => {
      const schema: any = {
        type: 'object',
        properties: {
          port: {
            type: 'number',
            title: 'Port',
            description: 'The port on which the N2K server listens',
            default: 3001
          }
        }
      }

      return schema
    },

    uiSchema: () => {
      const uiSchema: any = {}

      return uiSchema
    }
  }

  return plugin
}

function socketMessageHandler(
  app: ServerAPI,
  socket: Socket,
  unsubscribes: Unsubscribes
) {
  return (msg: any) => {
    //;(app as any).emit('nmea2000Out', msg)
    const pgn = parseN2kString(msg)
    if (pgn) {
      const actisense = toActisenseSerialFormat(
        pgn.pgn,
        pgn.data,
        pgn.dst,
        pgn.src
      )
      app.debug('Emitting: ' + actisense)
      ;(app as any).emit('nmea2000out', actisense)
      return
    }
  }
}

export function binToActisense(
  pgn: any,
  timestamp: string,
  data: string[],
  length: number
) {
  const arr: string[] = []
  return (
    timestamp +
    `,${pgn.prio},${pgn.pgn},${pgn.src},${pgn.dst},${length},` +
    data.map((x) => (x.length === 1 ? '0' + x : x)).join(',')
  )
}

module.exports = start
export default start
