import { Body, Controller, Get, HttpCode, Post, Res } from '@nestjs/common';
import { SetupInput, type SessionDto, type SetupStatus } from '@mimark/contracts/session';
import type { Response } from 'express';
import { ReqInfo } from '../../common/ctx.js';
import { Public, SESSION_COOKIE, sessionCookieOptions } from '../session/session.guard.js';
import { SetupService } from './setup.service.js';

@Controller('setup')
export class SetupController {
  constructor(private readonly setup: SetupService) {}

  @Public()
  @Get()
  status(): Promise<SetupStatus> {
    return this.setup.status();
  }

  @Public()
  @Post()
  @HttpCode(200)
  async create(
    @Body({ schema: SetupInput }) input: SetupInput,
    @ReqInfo() info: ReqInfo,
    @Res({ passthrough: true }) res: Response,
  ): Promise<SessionDto> {
    const { token, session } = await this.setup.setup(input, info);
    res.cookie(SESSION_COOKIE, token, {
      ...sessionCookieOptions(),
      expires: new Date(session.expiresAt),
    });
    return session;
  }
}
