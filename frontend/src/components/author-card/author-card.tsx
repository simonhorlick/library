import { component$, useStyles$ } from "@builder.io/qwik";
import { type FragmentType, getFragmentData, graphql } from "~/__generated__";

// A GraphQL fragment that pulls the fields we need for the author card.
export const AuthorFragment = graphql(`
  fragment AuthorFragment on Author {
    name
    bio
  }
`);

export const AuthorCard = component$(
  (props: { author: FragmentType<typeof AuthorFragment> }) => {
    useStyles$(`
      .author-card {
        background: #f0f0f0;
      }
    `);

    const author = getFragmentData(AuthorFragment, props.author);
    return (
      <div class="author-card">
        <div class="name">{author.name}</div>
        <div class="bio">{author.bio}</div>
      </div>
    );
  }
);
