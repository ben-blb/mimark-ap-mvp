import { Body, Controller, Delete, Get, HttpCode, Post, Req, Res } from '@nestjs/common';
import { LoginInput, type SessionDto } from '@mimark/contracts/session';
import type { CookieOptions, Request, Response } from 'express';
import { AppError } from '../../common/app-error.js';
import { ReqInfo } from '../../common/ctx.js';
import { env } from '../../config/env.js';
import { Public, SESSION_COOKIE } from './session.guard.js';
import { SessionService, toSessionDto } from './session.service.js';

@Controller('session')
export class SessionController {
  constructor(private readonly sessions: SessionService) {}

  @Public()
  @Post()
  @HttpCode(200)
  async login(
    @Body({ schema: LoginInput }) input: LoginInput,
    @ReqInfo() info: ReqInfo,
    @Res({ passthrough: true }) res: Response,
  ): Promise<SessionDto> {
    const { token, session } = await this.sessions.login(input, info);
    res.cookie(SESSION_COOKIE, token, { ...cookieOptions(), expires: new Date(session.expiresAt) });
    return session;
  }

  @Get()
  current(@Req() req: Request): SessionDto {
    if (!req.session) throw new AppError('UNAUTHENTICATED');
    return toSessionDto(req.session);
  }

  @Public()
  @Delete()
  @HttpCode(204)
  logout(@Res({ passthrough: true }) res: Response): void {
    res.clearCookie(SESSION_COOKIE, cookieOptions());
  }
}

function cookieOptions(): CookieOptions {
  return { httpOnly: true, secure: env.NODE_ENV === 'production', sameSite: 'lax', path: '/' };
}
