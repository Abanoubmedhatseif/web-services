const { ApolloServer, gql } = require("apollo-server");
const { GraphQLError } = require("graphql");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const { User, Post } = require("./db");

const typeDefs = gql`
  type User {
    id: ID!
    isActive: Boolean!
    age: Int!
    name: String!
    email: String
    role: Role!
    posts(last: Int): [Post]
  }

  type Post {
    id: ID!
    title: String!
    body: String!
  }

  type Comment {
    name: String
  }

  union SearchResult = User | Post | Comment

  enum Role {
    ADMIN
    USER
    GUEST
  }

  input PaginationInput {
    page: Int!
    count: Int!
  }

  type Query {
    helloworld: String
    profile: User
    getPosts(pagination: PaginationInput!): [Post]
    getUsers(pagination: PaginationInput!): [User!]!
    getUserByID(userId: Int!): User!
  }

  type RegisterationResponse {
    isSuccess: Boolean!
    message: String!
  }

  type LoginResult {
    isSuccess: Boolean!
    message: String!
    token: String!
  }

  type Mutation {
    register(
      email: String!
      name: String!
      password: String!
    ): RegisterationResponse

    login(email: String!, password: String!): LoginResult
  }
`;

const loginResolver = async (parent, args) => {
  const { email, password } = args;
  const user = await User.findOne({ where: { email } });
  if (!user) throw new Error("Invalid Credentials");

  const isPasswordMatch = await bcrypt.compare(password, user.password);
  if (!isPasswordMatch) throw new Error("Invalid Credentials");

  const userToken = jwt.sign({ email: user.email }, process.env.JWT_SECRET, {
    expiresIn: "1d",
  });

  return {
    isSuccess: true,
    message: "login succeeded",
    token: userToken,
  };
};

const registerUserResolver = async (parent, user) => {
  const isDuplicateUser = await User.findOne({ where: { email: user.email } });
  if (isDuplicateUser) {
    throw new GraphQLError("The email you entered is duplicate", {
      extensions: { code: "DUPLICATE_EMAIL" },
    });
  }

  const userDoc = {
    ...user,
    password: await bcrypt.hash(user.password, 12),
  };

  await User.create(userDoc);
  return { isSuccess: true, message: "User registered successfully" };
};

const resolvers = {
  User: {
    posts: async (parent, args) => {
      return await Post.findAll({
        where: { userId: parent.id },
        limit: args.last,
      });
    },
  },
  Mutation: {
    register: registerUserResolver,
    login: loginResolver,
  },
  Query: {
    profile: () => {
      return {};
    },
    getUsers: async (parent, args, context) => {
      const {
        pagination: { page, count },
      } = args;

      if (!context.loggedUser?.email) {
        throw new Error("UNAUTHORIZED");
      }

      return await User.findAll({
        offset: (page - 1) * count,
        limit: count,
      });
    },
    getUserByID: async (parent, args) => {
      const { userId } = args;
      return await User.findByPk(userId);
    },
  },
};

const app = new ApolloServer({
  context: async (ctx) => {
    let loggedUser = null;
    const token = ctx.req.headers["authorization"];
    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      loggedUser = payload;
    } catch (error) {
      console.error(error);
    }

    return { loggedUser };
  },
  typeDefs,
  resolvers,
});

app.listen(3001).then(() => {
  console.log("Server started on http://localhost:3001");
});
