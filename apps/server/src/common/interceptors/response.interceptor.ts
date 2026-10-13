import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, map } from 'rxjs';

/**
 * Standardizes successful responses as `{ data, timestamp }`.
 *
 * Skip conditions:
 *   - Non-HTTP contexts (WebSocket gateways) pass through untouched.
 *   - If the handler already returns an object with `data` or `error`, pass through.
 *   - If the controller wants raw output (files, streams), opt out via a decorator
 *     later (e.g. @SkipWrap()) — not implemented yet.
 */
@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T, unknown> {
	intercept(context: ExecutionContext, next: CallHandler<T>): Observable<unknown> {
		// WS handlers return their own WsAck shape.
		if (context.getType() !== 'http') return next.handle();
		return next.handle().pipe(
			map((data) => {
				if (data !== null && typeof data === 'object' && ('data' in data || 'error' in data)) {
					return data;
				}
				return { data, timestamp: new Date().toISOString() };
			}),
		);
	}
}
