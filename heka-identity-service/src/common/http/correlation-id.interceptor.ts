import { randomUUID } from 'crypto'

import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common'
import { Request, Response } from 'express'
import { Observable, tap } from 'rxjs'

const REQUEST_ID = /^[A-Za-z0-9_-]{1,64}$/

@Injectable()
export class CorrelationIdInterceptor implements NestInterceptor {
  private readonly logger = new Logger(CorrelationIdInterceptor.name)

  public intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp()
    const request = http.getRequest<Request>()
    const response = http.getResponse<Response>()
    const incoming = request.header('x-request-id')
    const requestId = incoming && REQUEST_ID.test(incoming) ? incoming : randomUUID()
    response.setHeader('x-request-id', requestId)
    return next.handle().pipe(
      tap(() => {
        this.logger.log(`requestId=${requestId} status=${response.statusCode}`)
      }),
    )
  }
}
