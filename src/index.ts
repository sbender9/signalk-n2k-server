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
import {
  parseN2kString,
  toActisenseSerialFormat,
  encodeCandump2,
  encodeActisense,
  encodeActisenseN2KACSII,
  encodeCandump1,
  encodeCandump3,
  encodeMXPGN,
  encodePCDIN,
  encodePDGY,
  encodeYDRAWFull
} from '@canboat/canboatjs'
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
          let parsed: any
          const format = props.format || 'actisense-n2k-ascii'
          if (typeof output !== 'string') {
            const timestamp = new Date().toISOString()
            let actisene = binToActisense(
              output.pgn,
              timestamp,
              output.data,
              output.length
            )
            if (format === 'actisense') {
              socket.write(actisene + '\n')
              return
            }
            parsed = parseN2kString(actisene)
          } else {
            parsed = parseN2kString(output)
          }
          if (parsed === null) {
            return
          }
          let res: string | string[] | undefined

          switch (format) {
            case 'actisense':
              res = encodeActisense(parsed)
              break
            case 'ydraw':
              res = encodeYDRAWFull(parsed)
              break
            case 'pcdin':
              res = encodePCDIN(parsed)
              break
            case 'mxpgn':
              res = encodeMXPGN(parsed)
              break
            case 'ikonvert':
              res = encodePDGY(parsed)
              break
            case 'candump1':
              res = encodeCandump1(parsed)
              break
            case 'candump2':
              res = encodeCandump2(parsed)
              break
            case 'candump3':
              res = encodeCandump3(parsed)
              break
            case 'canboat':
              res = output
              break
            case 'actisense-n2k-ascii':
              res = encodeActisenseN2KACSII(parsed)
              break
            default:
              res = undefined
              break
          }
          if (typeof res === 'string') {
            socket.write(res + '\n')
          } else if (Array.isArray(res)) {
            res.forEach((r) => socket.write(r + '\n'))
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
          },
          format: {
            type: 'string',
            title: 'Format',
            description: 'The format of the N2K data',
            enum: [
              'actisense',
              'actisense-n2k-ascii',
              'ydraw',
              'pcdin',
              'mxpgn',
              'ikonvert',
              'candump1',
              'candump2',
              'candump3',
              'canboat'
            ],
            default: 'actisense-n2k-ascii'
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
  _socket: Socket,
  _unsubscribes: Unsubscribes
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
  return (
    timestamp +
    `,${pgn.prio},${pgn.pgn},${pgn.src},${pgn.dst},${length},` +
    data.map((x) => (x.length === 1 ? '0' + x : x)).join(',')
  )
}

module.exports = start
export default start
