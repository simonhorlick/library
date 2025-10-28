---
--- General setup
---

GRANT USAGE ON SCHEMA public TO api_user;

CREATE FUNCTION set_updated_at_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
RETURN NEW;
END;
$$ LANGUAGE plpgsql;

---
--- Users
---

-- CREATE TABLE users (
--     "sub" TEXT PRIMARY KEY,
--     "email" TEXT NOT NULL,
--     "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
--     "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

--     CONSTRAINT sub_not_empty_ck CHECK (sub <> '' AND length(sub) < 100),
--     CONSTRAINT email_not_empty_ck CHECK (email <> '' AND length(email) < 100),
--     CONSTRAINT email_format_ck CHECK (email ~* '^.+@.+\..+$'),
--     CONSTRAINT unique_email UNIQUE (email)
-- );

CREATE DOMAIN email AS TEXT;
ALTER DOMAIN email ADD CONSTRAINT email_format_ck CHECK (VALUE ~* '^.+@.+\..+$');

COMMENT ON DOMAIN email IS 'A valid email address';

CREATE TABLE users (
    "id" BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    "email" email NOT NULL,
    "bio" TEXT,
    "username" TEXT NOT NULL,
    
    "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

    CONSTRAINT email_min_length_ck CHECK (length(email) >= 5),
    CONSTRAINT email_max_length_ck CHECK (length(email) < 255),
    CONSTRAINT unique_user_username UNIQUE (username),
    CONSTRAINT unique_user_email UNIQUE (email)
);

ALTER TABLE users ADD COLUMN phone_number TEXT;
ALTER TABLE users ADD CONSTRAINT phone_number_format_ck CHECK (phone_number IS NULL OR phone_number LIKE '+60%');

COMMENT ON TABLE users IS 'A user of the system';
COMMENT ON COLUMN users.email IS 'The email address of the user. Must be a valid email address and cannot be empty.';
COMMENT ON COLUMN users.username IS 'The username of the user. Cannot be empty and must be unique.';
COMMENT ON COLUMN users.bio IS 'A brief biography of the user.';

GRANT ALL PRIVILEGES ON public.users TO api_user;

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

CREATE FUNCTION has_permission(permission TEXT) RETURNS BOOLEAN
LANGUAGE sql AS $$
  SELECT permission = ANY(string_to_array(current_setting('app.token.permissions', true), ','));
$$;

CREATE POLICY select_user_policy ON public.users FOR SELECT USING (has_permission('read:user'));
CREATE POLICY insert_user_policy ON public.users FOR INSERT WITH CHECK (has_permission('write:user'));
CREATE POLICY update_user_policy ON public.users FOR UPDATE USING (has_permission('write:user'));
CREATE POLICY delete_user_policy ON public.users FOR DELETE USING (has_permission('delete:user'));

---
--- Authors
---

CREATE TABLE authors (
    "id" BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    "name" TEXT NOT NULL,
    "bio" TEXT,
    "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

    CONSTRAINT name_not_empty_ck CHECK (name <> '' AND length(name) < 1000),
    CONSTRAINT bio_length_ck CHECK (length(bio) < 10000)
);

COMMENT ON TABLE authors IS 'An author of a book';
COMMENT ON COLUMN authors.name IS 'The name of the author. Cannot be empty and must be less than 1000 characters.';
COMMENT ON COLUMN authors.bio IS 'A brief biography of the author. Must be less than 10000 characters.';

GRANT ALL PRIVILEGES ON public.authors TO api_user;

CREATE TRIGGER set_timestamp_on_author
BEFORE
UPDATE ON authors
FOR EACH ROW
EXECUTE PROCEDURE set_updated_at_timestamp();

---
--- Books
---

CREATE TABLE books (
    "isbn" VARCHAR(13) PRIMARY KEY,
    CONSTRAINT isbn_not_empty_ck CHECK (isbn <> ''),


    "title" TEXT NOT NULL,
    CONSTRAINT title_not_empty_ck CHECK (title <> '' AND length(title) < 1000),

    "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

ALTER TABLE books ADD CONSTRAINT isbn_max_length_ck CHECK (length(isbn) <= 13);

COMMENT ON TABLE books IS 'A single edition of a book';
COMMENT ON COLUMN books.title IS 'The title of the book. Cannot be empty and must be less than 1000 characters.';
COMMENT ON COLUMN books.isbn IS 'The ISBN of the book. Must be a 10 or 13 digit ISBN.';

GRANT ALL PRIVILEGES ON public.books TO api_user;

CREATE TRIGGER set_timestamp_on_book
BEFORE
UPDATE ON books
FOR EACH ROW
EXECUTE PROCEDURE set_updated_at_timestamp();

---
--- Book Authors (many-to-many relationship)
---

CREATE TABLE book_authors (
    "book_isbn" VARCHAR(13) NOT NULL,
    CONSTRAINT fk_book_isbn FOREIGN KEY (book_isbn) REFERENCES books (isbn),

    "author_id" BIGINT NOT NULL,
    CONSTRAINT fk_book_author_id FOREIGN KEY (author_id) REFERENCES authors (id),

    PRIMARY KEY (book_isbn, author_id)
);

COMMENT ON TABLE book_authors IS 'The authors of a book (many-to-many relationship)';
COMMENT ON COLUMN book_authors.book_isbn IS 'The ISBN of the book';
COMMENT ON COLUMN book_authors.author_id IS 'An author of the book';

GRANT ALL PRIVILEGES ON public.book_authors TO api_user;

CREATE TRIGGER set_timestamp_on_book
BEFORE
UPDATE ON books
FOR EACH ROW
EXECUTE PROCEDURE set_updated_at_timestamp();
