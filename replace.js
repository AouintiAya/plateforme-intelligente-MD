import fs from 'fs';

let content = fs.readFileSync('src/App.tsx', 'utf-8');

content = content.replace(/bg-indigo-600/g, 'bg-primary');
content = content.replace(/text-indigo-600/g, 'text-primary');
content = content.replace(/border-indigo-600/g, 'border-primary');
content = content.replace(/shadow-indigo-600/g, 'shadow-primary');
content = content.replace(/ring-indigo-600/g, 'ring-primary');

content = content.replace(/bg-indigo-700/g, 'bg-primary-hover');
content = content.replace(/text-indigo-700/g, 'text-primary-hover');

content = content.replace(/bg-indigo-800/g, 'bg-primary-hover');
content = content.replace(/text-indigo-800/g, 'text-primary-hover');

content = content.replace(/bg-indigo-50\//g, 'bg-primary/10/');
content = content.replace(/bg-indigo-50/g, 'bg-primary/10');
content = content.replace(/text-indigo-50/g, 'text-primary/10');
content = content.replace(/border-indigo-50/g, 'border-primary/10');

content = content.replace(/bg-indigo-100/g, 'bg-primary/20');
content = content.replace(/text-indigo-100/g, 'text-primary/20');
content = content.replace(/border-indigo-100/g, 'border-primary/20');
content = content.replace(/shadow-indigo-100/g, 'shadow-primary/20');

content = content.replace(/bg-indigo-200/g, 'bg-primary/30');
content = content.replace(/text-indigo-200/g, 'text-primary/30');
content = content.replace(/border-indigo-200/g, 'border-primary/30');
content = content.replace(/shadow-indigo-200/g, 'shadow-primary/30');

content = content.replace(/border-indigo-400/g, 'border-primary/50');
content = content.replace(/border-indigo-500/g, 'border-primary/80');
content = content.replace(/ring-indigo-500/g, 'ring-primary/80');

content = content.replace(/color="indigo"/g, 'color="primary"');
content = content.replace(/indigo:/g, 'primary:');

fs.writeFileSync('src/App.tsx', content);
console.log('Replaced indigo with primary in src/App.tsx');
