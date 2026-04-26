import { prisma } from "./src/lib/prisma";

async function test() {
  try {
    const count = await prisma.user.count();
    console.log("Connection successful, user count:", count);
  } catch (err) {
    console.error("Connection failed:", err);
  } finally {
    await prisma.$disconnect();
  }
}

test();
