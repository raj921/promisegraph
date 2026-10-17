import React from 'react';
import {createRoot} from 'react-dom/client';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {MotionConfig} from 'motion/react';
import '@fontsource-variable/inter/standard.css';
import './style.css';
import App from './App';
const client=new QueryClient({defaultOptions:{queries:{retry:1,staleTime:5000,refetchOnWindowFocus:false},mutations:{retry:false}}});
createRoot(document.getElementById('root')!).render(<React.StrictMode><QueryClientProvider client={client}><MotionConfig reducedMotion="user"><App/></MotionConfig></QueryClientProvider></React.StrictMode>);
