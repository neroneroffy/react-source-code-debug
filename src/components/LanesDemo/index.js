/**
 * Author: NERO
 * Date: 2020/7/22 0022
 * Time: 22:14
 *
 */
import React, { useState, useTransition, Suspense } from "react";

import "./style.css";

const tabs = ["Home", "Profile", "Groups", "Video"].map((label, id) => {
  let resolve;
  const tab = {
    id,
    label,
    promise: new Promise(res => {
      resolve = res;
    }),
    resolve() {
      tab.promise = null;
      resolve();
    }
  };
  return tab;
});

// Eagerly resolve Home
tabs[0].resolve();

function TabLink({ tab, isActive, setActiveTab }) {
  const [startTransition, isPending] = useTransition({ timeoutMs: 100000 });
  const onMouseDown = () => {
    startTransition(() => setActiveTab(tab));
  };

  let className = "link";
  if (isActive) {
    className += " active";
  } else if (isPending) {
    className += " pending";
  }
  return (
    <button
      type="button"
      className={className}
      onClick={onMouseDown}
      onMouseDown={onMouseDown}
    >
      <div>{tab.label}</div>
      {isPending ? <div className="spinner" /> : null}
    </button>
  );
}

function ResolveLink({ tab }) {
  return (
    <div>
      <button type="button" onClick={() => tab.resolve()}>
        Finish {tab.label}
      </button>
    </div>
  );
}

function Content({ tab }) {
  const promise = tab.promise;
  if (promise !== null) {
    throw promise;
  }

  return <h1>{tab.label}</h1>;
}

function LanesDemo() {
  const [activeTab, setActiveTab] = useState(tabs[0]);
  return (
    <>
      <div className="navigation">
        {tabs.map(tab => (
          <TabLink
            key={tab.id}
            isActive={activeTab === tab}
            setActiveTab={setActiveTab}
            tab={tab}
          />
        ))}
      </div>
      <Suspense fallback={<h1>Loading...</h1>}>
        <Content key={activeTab.id} tab={activeTab} />
      </Suspense>
      <div className="networkPanel">
        {tabs.map(tab => (
          <ResolveLink key={tab.id} tab={tab} />
        ))}
      </div>
    </>
  );
}
export default LanesDemo
