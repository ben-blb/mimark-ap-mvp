import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { Id } from '@mimark/contracts/common';
import {
  CreateUserInput,
  type ResetPasswordOutput,
  UpdateUserInput,
  type UserDto,
  type UserList,
} from '@mimark/contracts/users';
import { Ctx } from '../../common/ctx.js';
import { Requires } from '../session/session.guard.js';
import { UsersService } from './users.service.js';

/** Solo traduce HTTP. Todo el controller exige `users:manage` (solo admin, AC-013-17). */
@Requires('users:manage')
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  list(): Promise<UserList> {
    return this.users.list();
  }

  @Get(':id')
  get(@Param('id', { schema: Id }) id: string): Promise<UserDto> {
    return this.users.get(id);
  }

  @Post()
  create(
    @Body({ schema: CreateUserInput }) input: CreateUserInput,
    @Ctx() ctx: Ctx,
  ): Promise<UserDto> {
    return this.users.create(input, ctx);
  }

  @Patch(':id')
  update(
    @Param('id', { schema: Id }) id: string,
    @Body({ schema: UpdateUserInput }) input: UpdateUserInput,
    @Ctx() ctx: Ctx,
  ): Promise<UserDto> {
    return this.users.update(id, input, ctx);
  }

  @Post(':id/reset-password')
  @HttpCode(200)
  resetPassword(
    @Param('id', { schema: Id }) id: string,
    @Ctx() ctx: Ctx,
  ): Promise<ResetPasswordOutput> {
    return this.users.resetPassword(id, ctx);
  }

  @Delete(':id')
  @HttpCode(204)
  deactivate(@Param('id', { schema: Id }) id: string, @Ctx() ctx: Ctx): Promise<void> {
    return this.users.deactivate(id, ctx);
  }
}
