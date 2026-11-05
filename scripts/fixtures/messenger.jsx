// Presentation-only transport. No real API/DB calls or sent messages.
import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { GlobalAppChrome, PlanningFab, MessengerRoute, AppShell, SessionContext, ToastContext, CollectionNavigationContext } from '../../src/App.jsx?messenger-smoke';
import { api } from '../../src/api.js';
import { useVisualViewport } from '../../src/hooks/use-visual-viewport';
import '../../src/styles.css';
import '../../src/index.css';
const peer = { id:'bob', name:'Александра Оченьдлиннаяфамилия', username:'alexandra', avatarUrl:'' };
const contacts=Array.from({length:53},(_,index)=>({id:`contact-${index+1}`,name:`Контакт ${index+1}`,username:`contact${index+1}`,avatarUrl:''}));
const contactCid='68251116-acd9-480a-8831-38c3de344025';
const cid='4a0effb1-352d-4bc4-9f1f-6ee126840d01';
const messages=Array.from({length:75},(_,index)=>({id:String(index+1),senderId:index%2 ? 'alice' : 'bob',clientId:String(index),body:index===74 ? 'Привет! Давай обсудим планы на неделю. '+ 'Длинноеслово'.repeat(15) : `Сообщение ${index+1}\nВторая строка`,createdAt:'2026-11-01T12:00:00Z'}));
window.messengerTest={requests:[],failSend:false,failHistory:false,failList:false,failSubscriptions:false,opened:[],holdSearch:false, sends:[],sendDelay:100,delivered:[]};
const transport={
  async get(path) {
    window.messengerTest.requests.push(path);
    await new Promise(resolve=>setTimeout(resolve,30));
    if(path.endsWith('/subscriptions')) {
      if(window.messengerTest.failSubscriptions) throw Error('Подписки недоступны');
      return {users:[peer,...contacts]};
    }
    if(path.includes('participants')) {
      const search=new URL(path,location.origin).searchParams.get('search');
      if(window.messengerTest.holdSearch && search==='old') await new Promise(resolve=>setTimeout(resolve,900));
      return {users:search==='none' ? [] : [peer]};
    }
    if(path.includes('/messages')) {
      if(path.includes(contactCid)) return {messages:[],hasMore:false,peer:contacts.at(-1)};
      if(window.messengerTest.failHistory) throw Error('История недоступна');
      const params=new URL(path,location.origin).searchParams;
      const before=Number(params.get('before')||Infinity),after=Number(params.get('after')||0);
      const matched=messages.filter(item=>Number(item.id)<before && Number(item.id)>after);
      return {messages: after ? matched.slice(0,50) : matched.slice(-50),hasMore:matched.length>50,peer};
    }
    if(window.messengerTest.failList) throw Error('Диалоги недоступны');
    return {conversations:[{id:cid,peer,unread:2,lastMessage:messages.at(-1)},...window.messengerTest.opened]};
  },
  async post(path,body) {
    if(path.endsWith('/read')) return {ok:true};
    if(path.endsWith('/conversations')) {
      const conversation={id:contactCid,peer:contacts.find(contact=>contact.id===body.participantId),unread:0};
      if (!conversation.peer) throw Error('Unexpected conversation creation');
      window.messengerTest.opened.push(conversation);
      return {conversation};
    }
    window.messengerTest.sends.push(body);
    await new Promise(resolve=>setTimeout(resolve,window.messengerTest.sendDelay));
    const existing=messages.find(item=>item.clientId===body.clientId);
    const message=existing || {...body,id:String(messages.length+1),senderId:'alice',createdAt:new Date().toISOString()};
    if(!existing) messages.push(message);
    window.messengerTest.delivered.push(message);
    if(window.messengerTest.failSend) throw Error('Сеть недоступна');
    return {message};
  },
};
api.get=transport.get;api.post=transport.post;
function Fixture(){useVisualViewport();return <SessionContext.Provider value={{user:{id:'alice',name:'Алиса',username:'alice',accountType:'personal'}}}><ToastContext.Provider value={()=>{}}><CollectionNavigationContext.Provider value={{collection:null}}><GlobalAppChrome/><PlanningFab/><Routes><Route path="/app/messenger/:conversationId?" element={<AppShell><MessengerRoute user={{id:'alice'}}/></AppShell>}/><Route path="/app/wishes" element={<div className="app-layout app-layout--dark"><p>Исходная страница</p></div>}/></Routes></CollectionNavigationContext.Provider></ToastContext.Provider></SessionContext.Provider>;}
createRoot(document.getElementById('root')).render(<BrowserRouter><Fixture/></BrowserRouter>);
