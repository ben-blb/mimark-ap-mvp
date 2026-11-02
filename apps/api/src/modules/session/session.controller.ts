import { Body, Controller, Delete, Get, HttpCode, Post, Req, Res } from '@nestjs/common';
import { ChangePasswordInput, LoginInput, type SessionDto } from '@mimark/contracts/session';
import type { Request, Response } from 'express';
import { AppError } from '../../common/app-error.js';
import { ReqInfo } from '../../common/ctx.js';
import {
  AllowPasswordChange,
  Public,
  SESSION_COOKIE,
  sessionCookieOptions,
} from './session.guard.js';
import { toSessionDto } from './session.rules.js';
import { SessionService } from './session.service.js';

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
    res.cookie(SESSION_COOKIE, token, {
      ...sessionCookieOptions(),
      expires: new Date(session.expiresAt),
    });
    return session;
  }

  @AllowPasswordChange()
  @Post('password')
  @HttpCode(200)
  async changePassword(
    @Body({ schema: ChangePasswordInput }) input: ChangePasswordInput,
    @Req() req: Request,
    @ReqInfo() info: ReqInfo,
    @Res({ passthrough: true }) res: Response,
  ): Promise<SessionDto> {
    if (!req.session) throw new AppError('UNAUTHENTICATED');
    const { token, session } = await this.sessions.changePassword(req.session, input, info);
    res.cookie(SESSION_COOKIE, token, {
      ...sessionCookieOptions(),
      expires: new Date(session.expiresAt),
    });
    return session;
  }

  @AllowPasswordChange()
  @Get()
  current(@Req() req: Request): SessionDto {
    if (!req.session) throw new AppError('UNAUTHENTICATED');
    return toSessionDto(req.session);
  }

  @Public()
  @Delete()
  @HttpCode(204)
  logout(@Res({ passthrough: true }) res: Response): void {
    res.clearCookie(SESSION_COOKIE, sessionCookieOptions());
  }
}
