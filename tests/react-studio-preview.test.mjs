import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { loadReactStudioPreviewAssets } from '../src/react-studio-preview.mjs';

test('React Studio asset loader maps the Vite build under /studio-react',()=>{
  const root=mkdtempSync(join(tmpdir(),'rhymelab-react-assets-'));
  try{
    mkdirSync(join(root,'assets'),{recursive:true});
    writeFileSync(join(root,'index.html'),'<html><script src="/studio-react/assets/app.js"></script></html>');
    writeFileSync(join(root,'assets','app.js'),'console.log("r10")');
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

test('React Studio asset loader fails closed when the build is missing',()=>{
  assert.throws(
    ()=>loadReactStudioPreviewAssets(join(tmpdir(),'definitely-missing-rhymelab-react-assets')),
    /npm run studio:react:build/u,
  );
});
