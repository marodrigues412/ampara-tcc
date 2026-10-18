import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const AUTH = readFileSync(new URL('../services/authService.js', import.meta.url), 'utf8')
const APP = JSON.parse(readFileSync(new URL('../app.json', import.meta.url), 'utf8'))

test('login social volta sempre para mobile://auth-callback (liberado no Supabase)', () => {
  assert.match(AUTH, /export const URL_DE_RETORNO = "mobile:\/\/auth-callback"/)
  assert.match(AUTH, /export const urlDeRetorno = \(\) => URL_DE_RETORNO/)
  // Linking.createURL dava exp://<IP>:8081/--/auth-callback no Expo Go e no build de
  // desenvolvimento, que não batia com a lista do Supabase (voltava para localhost).
  assert.ok(!/Linking\.createURL\(/.test(AUTH))
})

test('o esquema do endereço de retorno é o do app.json', () => {
  assert.equal(APP.expo.scheme, 'mobile')
})
