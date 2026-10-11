import {api} from '../core/api.js';
import {setSession} from '../core/state.js';

// Sign-in state for one portal.
//
// The server decides who the user is and which role they have (POST /auth/login and
// GET /auth/me). A portal only checks that the role is the one it serves before it shows
// anything. That check is for the user's benefit and is not a security boundary: the
// API enforces every permission and campus/club scope on every request.
//
// The bearer token lives in sessionStorage (this tab only), under a key per portal so
// two portals served from one origin during development never share a session.
const tokenKey=portal=>`mirai:${portal.portalId}:token`;
export const storedToken=portal=>{try{return sessionStorage.getItem(tokenKey(portal))}catch{return null}};
const storeToken=(portal,token)=>{try{sessionStorage.setItem(tokenKey(portal),token)}catch{}};
export const roleMatches=(portal,user)=>!!user&&user.role===portal.expectedRole;

// Returns {ok:true,user} for an account this portal serves. For another role it returns
// {ok:false,user} and throws the token away unused. Bad credentials throw ApiError.
export async function signIn(portal,identifier,password){
 const r=await api('POST','/auth/login',{identifier,password});
 if(!roleMatches(portal,r.user))return{ok:false,user:r.user};
 storeToken(portal,r.access_token);setSession(r.access_token,r.user);return{ok:true,user:r.user}}

// Asks the server who the stored token belongs to. The token is used for this request
// only; the session starts after the role matches.
export async function fetchSessionUser(token){setSession(token,null);return api('GET','/auth/me')}

export function clearSession(portal){setSession(null,null);try{sessionStorage.removeItem(tokenKey(portal))}catch{}}
