import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
    newUser: "/register",
  },
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email:    { label: "Email",    type: "email"    },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const player = await prisma.player.findUnique({
          where:  { email: credentials.email as string },
          select: { id: true, email: true, username: true, passwordHash: true, isActive: true },
        });

        if (!player || !player.passwordHash || !player.isActive) return null;

        const isValid = await bcrypt.compare(
          credentials.password as string,
          player.passwordHash,
        );
        if (!isValid) return null;

        await prisma.player.update({
          where: { id: player.id },
          data:  { lastLoginAt: new Date() },
        });

        return { id: player.id, email: player.email, name: player.username };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id       = user.id;
        token.username = user.name;
      }
      return token;
    },
    async session({ session, token }) {
      if (token) {
        session.user.id   = token.id as string;
        session.user.name = token.username as string;
      }
      return session;
    },
  },
});
