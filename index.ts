const INSTANCE_URL = 'https://techhub.social';

async function fetchAllPosts() {
  try {
    // 1. 获取账户信息
    const accountResponse = await fetch(`${INSTANCE_URL}/api/v1/accounts/verify_credentials`, {
      headers: {
        'Authorization': `Bearer ${Deno.env.get("MASTODON_ACCESS_TOKEN")}`
      }
    });

    if (!accountResponse.ok) {
      console.log('account credential wrong')
      throw new Error('Failed to fetch account information');
    }

    const account = await accountResponse.json();
    const accountId = account.id;

    // 2. 获取所有帖子
    let allPosts = [];
    let url = `${INSTANCE_URL}/api/v1/accounts/${accountId}/statuses`;

      const postsResponse = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${Deno.env.get("MASTODON_ACCESS_TOKEN")}`
        }
      });

      if (!postsResponse.ok) {
        console.log('failed to fetch all posts')
        throw new Error('Failed to fetch posts');
      }

      let post_to_be_sync = null;
      const posts = await postsResponse.json();
      for(let index = 0; index < posts.length; index++) {
        let found = false;
        const element = posts[index];
        if (element.tags) {
          const ele_tags = element.tags;
          for (let i = 0; i < ele_tags.length; i++) {
            const tag = ele_tags[i];
            if (tag.name === "1link1day") {
              post_to_be_sync = element;
              found = true;
              break;
            }
          }
          if (found) {
            break;
          }
        }
      }
    return post_to_be_sync;
  } catch (error) {
    // 错误处理
    console.error('Error:', error.message);
  }
}

function parse_conent(mastodon_post) {
  let first_p = mastodon_post.content.indexOf("</p>");
  let title = mastodon_post.content.substring(3, first_p);
  let last_p = mastodon_post.content.lastIndexOf("<p>");
  let content = mastodon_post.content.substring(first_p + 4, last_p - 4)
  if (mastodon_post.media_attachments) {
    for(let i = 0; i < mastodon_post.media_attachments.length; i++) {
      let media = mastodon_post.media_attachments[i];
      if ('video' === media.type) {
        content += `<br/><video src="${media.url}" cover="${media.preview_url}" width="100%" controls/>
      `
      } else if ('image' === media.type) {
        content += `<br/><img src="${media.url}"/>
              `
      } else {
        // should be audio
        content += `<br/><audio src="${media.url}"/>
              `
      }
      
    }
  }
  let created_at = Date.now();
  return {
    _title: title,
    _content: content,
    _created_at: created_at
  }
}

async function syncPost(mastodon_post) {

  let parsed_content = parse_conent(mastodon_post);

  let req_body = {
    title: parsed_content._title,
    status: "published",
    attachment: {},
    url: "",
    content_html: parsed_content._content,
    image: "",
    date_published_ms: parsed_content._created_at,
    _microfeed: {}
  }
  let sync_resp = await fetch("https://1link.fun/api/items/",{
    headers: {
      "X-MicrofeedAPI-Key": `${Deno.env.get("MICROFEED_API_TOKEN")}`,
      "Content-Type": "application/json"
    },
    method: 'POST',
    body: JSON.stringify(req_body)
  })
  return sync_resp
}

async function do_the_sync() {
  let the_post = await fetchAllPosts()
    let kv = await Deno.openKv();
    let sync_status = await kv.get(["posts", the_post.id])
    if (sync_status.value === 'synced') {
      return new Response('synced')
    }
    if (the_post) {
      let sync_resp = await syncPost(the_post);
      //if (sync_resp.ok) {
        //await kv.set(["posts", the_post.id], "synced");
      //}
      return new Response(JSON.stringify(the_post));
    }
    return new Response('ko')
}

Deno.serve(async (req: Request) => {
  if (req.url.indexOf("shuoshuo521") <= 0) {
    return new Response('skip');
  }
  return await do_the_sync();
});