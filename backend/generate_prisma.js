const { execSync } = require('child_process');
const path = require('path');

try {
  console.log('Generating Prisma Client for updated schema...');
  const output = execSync('npx prisma generate', {
    cwd: __dirname,
    encoding: 'utf-8'
  });
  console.log(output);
  console.log('Prisma Client regenerated successfully!');
} catch (err) {
  console.error('Error generating Prisma client:', err.stdout || err.stderr || err.message);
}
