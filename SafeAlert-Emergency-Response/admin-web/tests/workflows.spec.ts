import { test,expect,type Page } from '@playwright/test';
async function login(page:Page){
  await page.goto('/login',{waitUntil:'domcontentloaded'});
  await page.getByLabel('Email address',{exact:true}).fill('admin@safealert.test');
  await page.getByLabel('Password',{exact:true}).fill('Local-review-only-42!');
  await page.getByRole('button',{name:'Sign in',exact:true}).click();
  await expect(page).toHaveURL('http://127.0.0.1:3002/');
}
test('review private evidence, approve registration and retain the decision',async({page})=>{
  await login(page);await page.goto('/approvals',{waitUntil:'domcontentloaded'});
  await page.getByRole('button',{name:'Review Pending Resident',exact:true}).click();
  await expect(page.getByRole('dialog')).toContainText('test municipality');
  await page.getByRole('button',{name:/View proof/}).click();
  await expect(page.getByRole('img',{name:/proof/i})).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'Approve registration',exact:true}).click();
  await page.getByRole('dialog').last().getByRole('button',{name:'Approve registration',exact:true}).click();
  await expect(page.getByText('Registration approved.',{exact:true})).toBeVisible();
  await page.goto('/users?status=approved',{waitUntil:'domcontentloaded'});
  await expect(page.getByRole('row').filter({hasText:'pending@safealert.test'})).toContainText('Approved');
  await page.screenshot({path:'test-results/approval-desktop.png',fullPage:true});
});
test('resolution validates reason and persists in history',async({page})=>{
  await login(page);await page.goto('/alerts',{waitUntil:'domcontentloaded'});
  await page.getByRole('button',{name:/View emergency/}).first().click();
  await page.getByRole('button',{name:'Mark resolved',exact:true}).click();
  const dialog=page.getByRole('dialog').last();
  await dialog.getByRole('button',{name:'Mark resolved',exact:true}).click();
  await expect(dialog.getByRole('alert')).toContainText('at least 10 characters');
  await dialog.getByRole('textbox').fill('Synthetic review: administrator verified resolution.');
  await dialog.getByRole('button',{name:'Mark resolved',exact:true}).click();
  await expect(page.getByText('Emergency resolved.',{exact:true})).toBeVisible();
  await page.goto('/records?status=resolved',{waitUntil:'domcontentloaded'});
  await expect(page.getByRole('table')).toContainText('Resolved');
  await page.screenshot({path:'test-results/records-desktop.png',fullPage:true});
});
test('failed load offers retry and mobile viewport stays usable',async({page})=>{
  await login(page);await page.setViewportSize({width:390,height:844});
  await page.route('**/api/admin/audit-logs*',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:{code:'UNAVAILABLE',message:'Temporary test outage'},requestId:'test'})}));
  await page.goto('/audit-logs',{waitUntil:'domcontentloaded'});
  await expect(page.getByRole('button',{name:'Try again'})).toBeVisible();
  await page.unroute('**/api/admin/audit-logs*');
  await page.getByRole('button',{name:'Try again'}).click();
  await expect(page.getByRole('table')).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await page.screenshot({path:'test-results/audit-mobile.png',fullPage:true});
});


