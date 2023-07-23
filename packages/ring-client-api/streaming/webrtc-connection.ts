import { WebSocket } from 'ws'
import { RingCamera } from '../ring-camera'

import { DingKind } from '../ring-types'
import {
  StreamingConnectionBase,
  StreamingConnectionOptions,
} from './streaming-connection-base'
import { fromBase64, logDebug } from '../util'

interface InitializationMessage {
  method: 'initialization'
  text: 'Done'
}

interface OfferMessage {
  method: 'sdp'
  sdp: string
  type: 'offer'
}

interface IceCandidateMessage {
  method: 'ice'
  ice: string
  mlineindex: number
}

interface LiveCallSession {
  alexa_port: number
  app_session_token: string
  availability_zone: 'availability-zone'
  custom_timer: { max_sec: number }
  ding_id: string
  ding_kind: DingKind
  doorbot_id: number
  exp: number
  ip: string
  port: number
  private_ip: string
  rms_fqdn: string
  rms_version: string
  rsp_port: number
  rtsp_port: number
  session_id: string
  sip_port: number
  webrtc_port: number
  webrtc_url: string
  wwr_port: number
}

function parseLiveCallSession(sessionId: string) {
  const encodedSession = sessionId.split('.')[1],
    text = fromBase64(encodedSession)
  return JSON.parse(text) as LiveCallSession
}

export class WebrtcConnection extends StreamingConnectionBase {
  constructor(
    private sessionId: string,
    camera: RingCamera,
    options: StreamingConnectionOptions
  ) {
    const liveCallSession = parseLiveCallSession(sessionId)
    super(
      new WebSocket(
       `wss://api.prod.signalling.ring.devices.a2z.com:443/ws?api_version=4.0&auth_type=ring_solutions&client_id=ring_site-${crypto.randomUUID()}&token=${ticket}`, {
                headers: {
                    // This must exist or the socket will close immediately but the contents do not seem
                    // to matter, however, I decided to use the Firefox default user agent since Firefox
                    // doesn't explicitly support H.265/HEVC
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/115.0'
                }
            })

        )
    this.addSubscriptions(
      this.onWsOpen.subscribe(() => {
        logDebug(`WebSocket connected for ${camera.name}`)
      })
    )
  }

  protected async handleMessage(
    message: InitializationMessage | OfferMessage | IceCandidateMessage
  ) {
    switch (message.method) {
      case 'sdp':
        const answer = await this.pc.createAnswer(message)
        this.sendSessionMessage('sdp', answer)
        this.onCallAnswered.next(message.sdp)

        this.activate()
        return
      case 'ice':
        await this.pc.addIceCandidate({
          candidate: message.ice,
          sdpMLineIndex: message.mlineindex,
        })
        return
    }
  }

  protected sendSessionMessage(method: string, body: Record<any, any> = {}) {
    this.sendMessage({
      ...body,
      method,
    })
  }
}
