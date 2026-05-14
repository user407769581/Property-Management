import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'

import { env } from '../config/env.js'

export type TokenScope = 'admin' | 'mp'

export interface TokenPayload {
  subject: string
  role: string
  scope: TokenScope
}

export const hashPassword = async (value: string) => bcrypt.hash(value, 10)

export const verifyPassword = async (value: string, hash: string) => bcrypt.compare(value, hash)

export const createAccessToken = (payload: TokenPayload) =>
  jwt.sign(
    {
      role: payload.role,
      scope: payload.scope,
    },
    env.jwtSecret,
    {
      subject: payload.subject,
      expiresIn: '8h',
    },
  )

export const decodeAccessToken = (token: string) =>
  jwt.verify(token, env.jwtSecret) as jwt.JwtPayload & {
    role: string
    scope: TokenScope
    sub: string
  }
