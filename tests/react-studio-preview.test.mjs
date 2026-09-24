import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  loadReactStudioPreviewAssets,
  reactStudioPreviewMode,
} from '../src/react-studio-preview.mjs';

test('React Studio preview is opt-in and default-route mode is explicit',()=>{
  assert.deepEqual(
    reactStudioPreviewMode({argv:[],env:{}}),
    {enabled:false,defaultRoute:false},
  );
  assert.deepEqual(
    reactStudioPreviewMode({argv:['--react-studio-preview'],env:{}}),
    {enabled:true,defaultRoute:false},
  );
  assert.deepEqual(
    reactStudioPreviewMode({argv:['--react-studio-preview-default'],env:{}}),
    {enabled:true,defaultRoute:true},
  );
});

test('React Studio preview mode supports explicit environment flags',()=>{
  assert.deepEqual(
    reactStudioPreviewMode({argv:[],env:{RHYMELAB_REACT_STUDIO_PREVIEW:'1'}}),
    {enabled:true,defaultRoute:false},
  );
  assert.deepEqual(
    reactStudioPreviewMode({argv:[],env:{RHYMELAB_REACT_STUDIO_PREVIEW_DEFAULT:'1'}}),
    {enabled:true,defaultRoute:true},
  );
});

test('React Studio preview asset loader maps the Vite build under /studio-react and keeps an index alias',()=>{
  const root=mkdtempSync(join(tmpdir(),'rhymelab-react-preview-'));
  try{
    mkdirSync(join(root,'assets'),{recursive:true});
    writeFileSync(join(root,'index.html'),'<html><script src="/studio-react/assets/app.js"></script></html>');
    writeFileSync(join(root,'assets','app.js'),'console.log("r7")');
    writeFileSync(join(root,'assets','app.css'),'body{}');

    const assets=loadReactStudioPreviewAssets(root);
    assert.equal(
      assets['/studio-react/'].body.toString(),
      '<html><script src="/studio-react/assets/app.js"></script></html>',
    );
    assert.equal(assets['/studio-react'].body,assets['/studio-react/'].body);
    assert.equal(assets['/studio-react/assets/app.js'].type,'text/javascript; charset=utf-8');
    assert.equal(assets['/studio-react/assets/app.css'].type,'text/css; charset=utf-8');
  }finally{
    rmSync(root,{recursive:true,force:true});
  }
});

test('React Studio preview asset loader fails closed when the build is missing',()=>{
  assert.throws(
    ()=>loadReactStudioPreviewAssets(join(tmpdir(),'definitely-missing-rhymelab-react-preview')),
    /npm run studio:react:build/u,
  );
});
