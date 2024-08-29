const AUTHORIZATION = "Bearer ***"; // replace with authorization value
const CLIENT_TID = "***"; // replace with X-Client-Transaction-Id value
const CLIENT_UUID = "***"; // replace with X-Client-Uuid value
const USER_ID = getCookie("twid").substring(4);
const CSRF_TOKEN = getCookie("ct0");
const RANDOM_RESOURCE = "uYU5M2i12UhDvDTzN6hZPg";
const RANDOM_RESOURCE_OLD_TWEETS = "H8OOoI-5ZE4NxgRr8lfyWg";
const LANGUAGE_CODE = navigator.language.split("-")[0];
const USERNAME = "YourUsernameHere"; // replace with your username
const USER_AGENT = navigator.userAgentData.brands.map(brand => `"${brand.brand}";v="${brand.version}"`).join(", ");
let stopSignal;
let tweetsToDelete = [];
let twitterArchiveContent;
let twitterArchiveLoadingConfirmed = false;

const deleteOptions = {
  fromArchive: false,
  unretweet: false,
  doNotRemovePinnedTweet: true,
  deleteMessageWithUrlOnly: false,
  deleteSpecificIdsOnly: [""],
  matchAnyKeywords: [""],
  tweetsToIgnore: ["00000000000000", "111111111111111", "222222222222"],
  oldTweets: false,
  afterDate: new Date("1900-01-01"),
  beforeDate: new Date("2100-01-01")
};

function buildAcceptLanguageString() {
  const languages = navigator.languages || ["en-US"];
  const defaultLang = "en-US,en;q=0.9";

  return languages.reduce((acc, lang, index) => {
    const quality = (1 - 0.1 * index).toFixed(1);
    return acc + `${lang};q=${quality},`;
  }, "").slice(0, -1) || defaultLang;
}

function getCookie(name) {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop().split(";").shift();
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchTweets(cursor, retry = 0) {
  const count = "20";
  const finalCursor = cursor ? `%22cursor%22%3A%22${cursor}%22%2C` : "";
  const resource = deleteOptions.oldTweets ? RANDOM_RESOURCE_OLD_TWEETS : RANDOM_RESOURCE;
  const endpoint = deleteOptions.oldTweets ? "UserTweets" : "UserTweetsAndReplies";
  const baseUrl = `https://x.com/i/api/graphql/${resource}/${endpoint}`;

  const variables = deleteOptions.oldTweets
    ? `?variables=%7B%22userId%22%3A%22${USER_ID}%22%2C%22count%22%3A${count}%2C${finalCursor}%22includePromotedContent%22%3Atrue%2C%22withQuickPromoteEligibilityTweetFields%22%3Atrue%2C%22withVoice%22%3Atrue%2C%22withV2Timeline%22%3Atrue%7D`
    : `?variables=%7B%22userId%22%3A%22${USER_ID}%22%2C%22count%22%3A${count}%2C${finalCursor}%22includePromotedContent%22%3Atrue%2C%22withCommunity%22%3Atrue%2C%22withVoice%22%3Atrue%2C%22withV2Timeline%22%3Atrue%7D`;

  const features = deleteOptions.oldTweets
    ? "&features=%7B%22responsive_web_graphql_exclude_directive_enabled%22%3Atrue%2C%22verified_phone_label_enabled%22%3Afalse%7D"
    : "&features=%7B%22rweb_lists_timeline_redesign_enabled%22%3Atrue%2C%22responsive_web_graphql_exclude_directive_enabled%22%3Atrue%7D";

  const finalUrl = `${baseUrl}${variables}${features}`;

  try {
    const response = await fetch(finalUrl, {
      headers: {
        accept: "*/*",
        "accept-language": buildAcceptLanguageString(),
        authorization: AUTHORIZATION,
        "content-type": "application/json",
        "sec-ch-ua": USER_AGENT,
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": "\"Windows\"",
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "same-origin",
        "x-client-transaction-id": CLIENT_TID,
        "x-client-uuid": CLIENT_UUID,
        "x-csrf-token": CSRF_TOKEN,
        "x-twitter-active-user": "yes",
        "x-twitter-auth-type": "OAuth2Session",
        "x-twitter-client-language": LANGUAGE_CODE
      },
      referrer: `https://x.com/${USERNAME}/with_replies`,
      referrerPolicy: "strict-origin-when-cross-origin",
      method: "GET",
      mode: "cors",
      credentials: "include"
    });

    if (!response.ok) {
      if (response.status === 429) {
        console.log("Rate limit reached. Waiting 1 minute");
        await sleep(60000);
        return fetchTweets(cursor, retry + 1);
      }

      if (retry >= 5) throw new Error("Max retries reached");

      console.log(`(fetchTweets) Network response was not ok, retrying in ${10 * (1 + retry)} seconds`);
      console.log(await response.text());
      await sleep(10000 * (1 + retry));
      return fetchTweets(cursor, retry + 1);
    }

    const data = await response.json();
    const entries = data.data.user.result.timeline_v2.timeline.instructions.find(item => item.type === "TimelineAddEntries").entries;
    console.log(entries);
    return entries;

  } catch (error) {
    console.error("Error fetching tweets:", error);
  }
}

async function logTweets(entries) {
  for (const item of entries) {
    if (item.entryId.startsWith("profile-conversation") || item.entryId.startsWith("tweet-")) {
      findTweetIds(item);
    } else if (item.entryId.startsWith("cursor-bottom") && entries.length > 2) {
      return item.content.value;
    }
  }
  return "finished";
}

function checkKeywords(text) {
  return deleteOptions.matchAnyKeywords.length === 0 || deleteOptions.matchAnyKeywords.some(word => text.includes(word));
}

function checkDate(tweet) {
  if (!tweet.legacy.hasOwnProperty("created_at")) return true;

  const tweetDate = new Date(tweet.legacy.created_at);
  tweetDate.setHours(0, 0, 0, 0);

  if (tweetDate > deleteOptions.afterDate && tweetDate < deleteOptions.beforeDate) return true;

  if (tweetDate < deleteOptions.afterDate) stopSignal = true;

  return false;
}

function checkDateArchive(createdAt) {
  const tweetDate = new Date(createdAt);
  tweetDate.setHours(0, 0, 0, 0);

  if (tweetDate > deleteOptions.afterDate && tweetDate < deleteOptions.beforeDate) return true;

  if (tweetDate < deleteOptions.afterDate) stopSignal = true;

  return false;
}

function checkFilter(tweet) {
  if (deleteOptions.tweetsToIgnore.includes(tweet.legacy.id_str) || deleteOptions.tweetsToIgnore.includes(parseInt(tweet.legacy.id_str))) return false;

  if (deleteOptions.deleteMessageWithUrlOnly && tweet.legacy.entities?.urls?.length > 0 && checkKeywords(tweet.legacy.full_text) && checkDate(tweet)) return true;

  return checkKeywords(tweet.legacy.full_text) && checkDate(tweet);
}

function checkFilterArchive(tweetObj) {
  const tweetId = tweetObj.id;
  const tweetStr = tweetObj.text;

  if (deleteOptions.tweetsToIgnore.includes(tweetId) || deleteOptions.tweetsToIgnore.includes(parseInt(tweetId))) return false;

  return checkKeywords(tweetStr) && checkDateArchive(tweetObj.date);
}

function checkTweetOwner(obj, uid) {
  const retweeted = obj.legacy?.retweeted;
  const userIdStr = obj.user_id_str || obj.legacy?.user_id_str;

  if (retweeted && !deleteOptions.unretweet) return false;

  return userIdStr === uid;
}

function tweetFound(obj) {
  console.log(`Found ${obj.legacy.full_text}`);
}

function parseTweetsFromArchive(data) {
  try {
    return data
      .filter(item => {
        const isInReplyToExcludedUser = item.tweet.in_reply_to_user_id_str === USER_ID;
        const startsWithRT = item.tweet.full_text.startsWith("RT ");

        const tweetObj = {
          id: item.tweet.id_str,
          text: item.tweet.full_text,
          date: item.tweet.created_at
        };

        return !isInReplyToExcludedUser &&
          ((deleteOptions.unretweet && startsWithRT) || (!deleteOptions.unretweet && !startsWithRT)) &&
          checkFilterArchive(tweetObj);
      })
      .map(item => item.tweet.id_str);
  } catch (error) {
    console.error("Error parsing JSON:", error);
  }
}

async function deleteTweets() {
  stopSignal = false;

  if (deleteOptions.fromArchive) {
    if (tweetsToDelete.length === 0 && twitterArchiveLoadingConfirmed) {
      console.log("No more tweets in your archive");
      return;
    }

    console.log("Deleting tweets from archive");
    twitterArchiveLoadingConfirmed = true;
    const temp = parseTweetsFromArchive(twitterArchiveContent);
    tweetsToDelete = tweetsToDelete.concat(temp);
    twitterArchiveContent = twitterArchiveContent.slice(1000);
  } else {
    const tweets = await fetchTweets();
    await logTweets(tweets);
  }

  console.log("Finished processing tweets");
}
